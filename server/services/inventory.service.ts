import { prisma, type Tx } from "../../lib/prisma";
import { AppError, conflict, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import { ASSET_STATUS, MOVEMENT_TYPE, RESERVATION_STATUS } from "../../config/status.config";
import { appConfig } from "../../config/app.config";
import { audit } from "../utils/audit";
import { skipTake, type Pagination } from "../../lib/validation";

type Counter = "quantityAvailable" | "quantityReserved" | "quantityIssued" | "quantityDamaged" | "quantityUnderRepair";

async function ensureStockRow(tx: Tx, categoryId: number, warehouseId: number) {
  await tx.inventoryStock.upsert({
    where: { categoryId_warehouseId: { categoryId, warehouseId } },
    update: {},
    create: { categoryId, warehouseId },
  });
}

/**
 * Atomically move `qty` units between counters. The decrement side is guarded in the
 * WHERE clause, so concurrent callers cannot drive a counter negative (one UPDATE statement).
 */
export async function moveStock(
  tx: Tx,
  categoryId: number,
  warehouseId: number,
  qty: number,
  from: Counter | null,
  to: Counter | null
) {
  await ensureStockRow(tx, categoryId, warehouseId);
  const data: Record<string, { increment?: number; decrement?: number }> = {};
  if (from) data[from] = { decrement: qty };
  if (to) data[to] = { increment: qty };
  const r = await tx.inventoryStock.updateMany({
    where: { categoryId, warehouseId, ...(from ? { [from]: { gte: qty } } : {}) },
    data,
  });
  if (r.count !== 1) throw conflict("Not enough stock available for this operation");
}

export async function recordMovementRow(
  tx: Tx,
  m: {
    categoryId: number;
    warehouseId: number;
    assetId?: number | null;
    movementType: string;
    quantity: number;
    reason?: string | null;
    referenceType?: string;
    referenceId?: number;
    actorId: number;
  }
) {
  await tx.inventoryMovement.create({
    data: {
      categoryId: m.categoryId,
      warehouseId: m.warehouseId,
      assetId: m.assetId ?? null,
      movementType: m.movementType,
      quantity: m.quantity,
      reason: m.reason ?? null,
      referenceType: m.referenceType ?? null,
      referenceId: m.referenceId ?? null,
      createdByUserId: m.actorId,
    },
  });
}

/**
 * Reserve stock for a request item. Serialized categories reserve specific assets
 * (conditional status update per asset); quantity-tracked categories reserve counts.
 */
export async function reserveForItem(
  tx: Tx,
  actor: AuthUser,
  item: { id: number; categoryId: number; isSerialized: boolean },
  warehouseId: number,
  quantity: number,
  correlationId?: string
) {
  const expiresAt = new Date(Date.now() + appConfig.reservationExpiryDays * 86_400_000);

  if (item.isSerialized) {
    const candidates = await tx.asset.findMany({
      where: { categoryId: item.categoryId, warehouseId, status: ASSET_STATUS.AVAILABLE },
      orderBy: { id: "asc" },
      take: quantity * 3,
      select: { id: true, assetTag: true },
    });
    const reserved: number[] = [];
    for (const c of candidates) {
      if (reserved.length === quantity) break;
      const r = await tx.asset.updateMany({
        where: { id: c.id, status: ASSET_STATUS.AVAILABLE },
        data: { status: ASSET_STATUS.RESERVED },
      });
      if (r.count === 1) reserved.push(c.id);
    }
    if (reserved.length < quantity) {
      throw conflict(`Only ${reserved.length} matching asset(s) are available in that warehouse`);
    }
    for (const assetId of reserved) {
      await moveStock(tx, item.categoryId, warehouseId, 1, "quantityAvailable", "quantityReserved");
      const res = await tx.inventoryReservation.create({
        data: {
          requestItemId: item.id,
          categoryId: item.categoryId,
          warehouseId,
          assetId,
          quantity: 1,
          status: RESERVATION_STATUS.ACTIVE,
          expiresAt,
          createdByUserId: actor.id,
        },
      });
      await recordMovementRow(tx, {
        categoryId: item.categoryId,
        warehouseId,
        assetId,
        movementType: MOVEMENT_TYPE.RESERVE,
        quantity: 1,
        referenceType: "inventory_reservation",
        referenceId: res.id,
        actorId: actor.id,
      });
    }
  } else {
    await moveStock(tx, item.categoryId, warehouseId, quantity, "quantityAvailable", "quantityReserved");
    const res = await tx.inventoryReservation.create({
      data: {
        requestItemId: item.id,
        categoryId: item.categoryId,
        warehouseId,
        quantity,
        status: RESERVATION_STATUS.ACTIVE,
        expiresAt,
        createdByUserId: actor.id,
      },
    });
    await recordMovementRow(tx, {
      categoryId: item.categoryId,
      warehouseId,
      movementType: MOVEMENT_TYPE.RESERVE,
      quantity,
      referenceType: "inventory_reservation",
      referenceId: res.id,
      actorId: actor.id,
    });
  }

  await audit(tx, {
    actorUserId: actor.id,
    action: "inventory.reserve",
    entityType: "hardware_request_item",
    entityId: item.id,
    after: { warehouseId, quantity },
    correlationId,
  });
}

/** Release an active reservation back to available stock. */
export async function releaseReservation(tx: Tx, actor: AuthUser, reservationId: number, reason: string, correlationId?: string) {
  const res = await tx.inventoryReservation.findUnique({ where: { id: reservationId } });
  if (!res) throw notFound("Reservation");
  const r = await tx.inventoryReservation.updateMany({
    where: { id: res.id, status: RESERVATION_STATUS.ACTIVE },
    data: { status: RESERVATION_STATUS.RELEASED, closedAt: new Date() },
  });
  if (r.count !== 1) throw conflict(`Reservation is ${res.status.toLowerCase()}, not active`);

  if (res.assetId) {
    const a = await tx.asset.updateMany({
      where: { id: res.assetId, status: ASSET_STATUS.RESERVED },
      data: { status: ASSET_STATUS.AVAILABLE },
    });
    if (a.count !== 1) throw conflict("The reserved asset is no longer in Reserved status");
  }
  await moveStock(tx, res.categoryId, res.warehouseId, res.quantity, "quantityReserved", "quantityAvailable");
  await recordMovementRow(tx, {
    categoryId: res.categoryId,
    warehouseId: res.warehouseId,
    assetId: res.assetId,
    movementType: MOVEMENT_TYPE.RELEASE,
    quantity: res.quantity,
    reason,
    referenceType: "inventory_reservation",
    referenceId: res.id,
    actorId: actor.id,
  });
  await audit(tx, {
    actorUserId: actor.id,
    action: "inventory.release",
    entityType: "inventory_reservation",
    entityId: res.id,
    before: { status: res.status },
    after: { status: RESERVATION_STATUS.RELEASED, reason },
    correlationId,
  });
  return res;
}

/** Issue a quantity-tracked reservation (consumables) to the requester. */
export async function issueConsumableReservation(tx: Tx, actor: AuthUser, reservationId: number, correlationId?: string) {
  const res = await tx.inventoryReservation.findUnique({
    where: { id: reservationId },
    include: { category: { select: { isSerialized: true } } },
  });
  if (!res) throw notFound("Reservation");
  if (res.assetId || res.category.isSerialized) {
    throw new AppError("VALIDATION_ERROR", "Serialized assets are issued through asset assignment");
  }
  const r = await tx.inventoryReservation.updateMany({
    where: { id: res.id, status: RESERVATION_STATUS.ACTIVE },
    data: { status: RESERVATION_STATUS.CONSUMED, closedAt: new Date() },
  });
  if (r.count !== 1) throw conflict(`Reservation is ${res.status.toLowerCase()}, not active`);

  await moveStock(tx, res.categoryId, res.warehouseId, res.quantity, "quantityReserved", "quantityIssued");
  await tx.hardwareRequestItem.update({
    where: { id: res.requestItemId },
    data: { fulfilledQuantity: { increment: res.quantity } },
  });
  await recordMovementRow(tx, {
    categoryId: res.categoryId,
    warehouseId: res.warehouseId,
    movementType: MOVEMENT_TYPE.ISSUE,
    quantity: res.quantity,
    referenceType: "inventory_reservation",
    referenceId: res.id,
    actorId: actor.id,
  });
  await audit(tx, {
    actorUserId: actor.id,
    action: "inventory.issue",
    entityType: "inventory_reservation",
    entityId: res.id,
    after: { quantity: res.quantity },
    correlationId,
  });
  return res;
}

/** Manual movement for quantity-tracked stock: receipt or signed adjustment. */
export async function recordManualMovement(
  actor: AuthUser,
  input: { categoryId: number; warehouseId: number; movementType: "Receipt" | "Adjustment"; quantity: number; reason: string },
  correlationId?: string
) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.hardwareCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw notFound("Category");
    if (category.isSerialized) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Stock for serialized categories changes through asset registration and returns"
      );
    }
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw notFound("Warehouse");

    if (input.movementType === "Receipt") {
      if (input.quantity <= 0) throw new AppError("VALIDATION_ERROR", "Receipt quantity must be positive");
      await moveStock(tx, input.categoryId, input.warehouseId, input.quantity, null, "quantityAvailable");
    } else if (input.quantity > 0) {
      await moveStock(tx, input.categoryId, input.warehouseId, input.quantity, null, "quantityAvailable");
    } else if (input.quantity < 0) {
      await moveStock(tx, input.categoryId, input.warehouseId, -input.quantity, "quantityAvailable", null);
    } else {
      throw new AppError("VALIDATION_ERROR", "Adjustment quantity cannot be zero");
    }

    await recordMovementRow(tx, {
      categoryId: input.categoryId,
      warehouseId: input.warehouseId,
      movementType: input.movementType,
      quantity: input.quantity,
      reason: input.reason,
      actorId: actor.id,
    });
    await audit(tx, {
      actorUserId: actor.id,
      action: `inventory.${input.movementType.toLowerCase()}`,
      entityType: "inventory_stock",
      entityId: `${input.categoryId}:${input.warehouseId}`,
      after: input,
      correlationId,
    });
  });
}

export async function listStock(p: Pagination & { categoryId?: number; warehouseId?: number }) {
  const where = {
    ...(p.categoryId ? { categoryId: p.categoryId } : {}),
    ...(p.warehouseId ? { warehouseId: p.warehouseId } : {}),
    ...(p.search ? { category: { name: { contains: p.search } } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.inventoryStock.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, code: true, isSerialized: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ category: { name: "asc" } }, { warehouse: { name: "asc" } }],
      ...skipTake(p),
    }),
    prisma.inventoryStock.count({ where }),
  ]);
  return { items, total };
}

/** Available quantity per warehouse for one category (used by IT review). */
export async function availability(categoryId: number) {
  return prisma.inventoryStock.findMany({
    where: { categoryId, quantityAvailable: { gt: 0 }, warehouse: { isActive: true } },
    select: {
      quantityAvailable: true,
      warehouse: { select: { id: true, name: true, code: true } },
    },
    orderBy: { quantityAvailable: "desc" },
  });
}

export async function listReservations(p: Pagination & { status?: string }) {
  const where = {
    ...(p.status ? { status: p.status } : {}),
    ...(p.search
      ? {
          OR: [
            { requestItem: { request: { requestNumber: { contains: p.search } } } },
            { asset: { assetTag: { contains: p.search } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.inventoryReservation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...skipTake(p),
      include: {
        category: { select: { name: true, isSerialized: true } },
        warehouse: { select: { name: true } },
        asset: { select: { id: true, assetTag: true } },
        requestItem: {
          select: {
            id: true,
            request: {
              select: { id: true, requestNumber: true, requester: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
    }),
    prisma.inventoryReservation.count({ where }),
  ]);
  return { items, total };
}

export async function listMovements(p: Pagination) {
  const where = p.search
    ? { OR: [{ category: { name: { contains: p.search } } }, { asset: { assetTag: { contains: p.search } } }] }
    : {};
  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...skipTake(p),
      include: {
        category: { select: { name: true } },
        warehouse: { select: { name: true } },
        asset: { select: { assetTag: true } },
        createdBy: { select: { fullName: true } },
      },
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  return { items, total };
}
