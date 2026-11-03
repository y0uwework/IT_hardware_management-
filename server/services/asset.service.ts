import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import {
  ASSET_STATUS,
  MOVEMENT_TYPE,
  REQUEST_STATUS,
  RESERVATION_STATUS,
  type RequestStatus,
} from "../../config/status.config";
import { appConfig } from "../../config/app.config";
import { audit } from "../utils/audit";
import { userHas } from "../middleware/authorize";
import { moveStock, recordMovementRow } from "./inventory.service";
import { notify, NOTIFICATION_EVENT } from "./notification.service";
import { recomputeFulfilment } from "./request.service";
import type { AssetCreateInput, AssetListQuery, AssetUpdateInput, AssignInput, ReturnInput } from "../validators/asset.validators";
import { skipTake } from "../../lib/validation";

const ASSIGNABLE_REQUEST_STATUSES: RequestStatus[] = [
  REQUEST_STATUS.UNDER_IT_REVIEW,
  REQUEST_STATUS.AWAITING_PROCUREMENT,
  REQUEST_STATUS.PARTIALLY_FULFILLED,
];

const dateOrNull = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function registerAsset(user: AuthUser, input: AssetCreateInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.hardwareCategory.findUnique({ where: { id: input.categoryId } });
    if (!category || !category.isActive) throw new AppError("VALIDATION_ERROR", "Category is invalid or inactive");
    if (!category.isSerialized) {
      throw new AppError(
        "VALIDATION_ERROR",
        `"${category.name}" is quantity-tracked. Record a stock receipt in Inventory instead of registering individual assets.`
      );
    }
    const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse || !warehouse.isActive) throw new AppError("VALIDATION_ERROR", "Warehouse is invalid or inactive");

    if (input.serialNumber) {
      const dup = await tx.asset.findFirst({
        where: { serialNumber: input.serialNumber, categoryId: input.categoryId },
        select: { assetTag: true },
      });
      if (dup) throw conflict(`Serial number already registered on ${dup.assetTag}`);
    }

    const asset = await tx.asset.create({
      data: {
        assetTag: `TMP-${randomUUID().slice(0, 24)}`,
        serialNumber: input.serialNumber,
        categoryId: input.categoryId,
        manufacturer: input.manufacturer,
        model: input.model,
        specification: input.specification,
        purchaseDate: dateOrNull(input.purchaseDate),
        purchaseCost: input.purchaseCost === null ? null : new Prisma.Decimal(input.purchaseCost),
        warrantyEndDate: dateOrNull(input.warrantyEndDate),
        warehouseId: input.warehouseId,
        condition: input.condition,
        status: ASSET_STATUS.AVAILABLE,
        notes: input.notes,
        createdByUserId: user.id,
      },
    });
    const assetTag = `${appConfig.assetTagPrefix}-${String(asset.id).padStart(6, "0")}`;
    await tx.asset.update({ where: { id: asset.id }, data: { assetTag } });

    await moveStock(tx, input.categoryId, input.warehouseId, 1, null, "quantityAvailable");
    await recordMovementRow(tx, {
      categoryId: input.categoryId,
      warehouseId: input.warehouseId,
      assetId: asset.id,
      movementType: MOVEMENT_TYPE.RECEIPT,
      quantity: 1,
      reason: "Asset registered",
      referenceType: "asset",
      referenceId: asset.id,
      actorId: user.id,
    });
    await audit(tx, {
      actorUserId: user.id,
      action: "asset.register",
      entityType: "asset",
      entityId: asset.id,
      after: { assetTag, ...input },
      correlationId,
    });
    return { id: asset.id, assetTag };
  });
}

export async function updateAsset(user: AuthUser, id: number, input: AssetUpdateInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.asset.findUnique({ where: { id } });
    if (!before) throw notFound("Asset");
    const data: Prisma.AssetUpdateInput = {};
    if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber;
    if (input.manufacturer !== undefined) data.manufacturer = input.manufacturer;
    if (input.model !== undefined) data.model = input.model;
    if (input.specification !== undefined) data.specification = input.specification;
    if (input.warrantyEndDate !== undefined) data.warrantyEndDate = dateOrNull(input.warrantyEndDate);
    if (input.notes !== undefined) data.notes = input.notes;
    const after = await tx.asset.update({ where: { id }, data });
    await audit(tx, {
      actorUserId: user.id,
      action: "asset.update",
      entityType: "asset",
      entityId: id,
      before,
      after,
      correlationId,
    });
    return { id };
  });
}

export async function listAssets(q: AssetListQuery) {
  const where: Prisma.AssetWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.warehouseId ? { warehouseId: q.warehouseId } : {}),
    ...(q.search
      ? {
          OR: [
            { assetTag: { contains: q.search } },
            { serialNumber: { contains: q.search } },
            { model: { contains: q.search } },
            { manufacturer: { contains: q.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { id: "desc" },
      ...skipTake(q),
      include: {
        category: { select: { name: true } },
        warehouse: { select: { name: true } },
        assignments: {
          where: { isActive: true },
          take: 1,
          select: { user: { select: { id: true, fullName: true } }, acknowledgedAt: true },
        },
      },
    }),
    prisma.asset.count({ where }),
  ]);
  return { items, total };
}

export async function getAsset(user: AuthUser, id: number) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      createdBy: { select: { fullName: true } },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: {
          user: { select: { id: true, fullName: true, employeeCode: true } },
          issuedBy: { select: { fullName: true } },
          returnedTo: { select: { fullName: true } },
          requestItem: { select: { request: { select: { id: true, requestNumber: true } } } },
        },
      },
      reservations: {
        where: { status: RESERVATION_STATUS.ACTIVE },
        include: {
          requestItem: {
            select: {
              id: true,
              request: { select: { id: true, requestNumber: true, requester: { select: { id: true, fullName: true } } } },
            },
          },
        },
      },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { createdBy: { select: { fullName: true } }, warehouse: { select: { name: true } } },
      },
    },
  });
  if (!asset) throw notFound("Asset");
  const isHolder = asset.assignments.some((a) => a.isActive && a.user.id === user.id);
  if (!userHas(user, "asset.view.all") && !isHolder) throw forbidden("You do not have access to this asset");
  return asset;
}

export async function myAssets(user: AuthUser) {
  return prisma.assetAssignment.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { assignedAt: "desc" },
    include: {
      asset: {
        select: {
          id: true,
          assetTag: true,
          serialNumber: true,
          manufacturer: true,
          model: true,
          warrantyEndDate: true,
          category: { select: { name: true } },
        },
      },
      issuedBy: { select: { fullName: true } },
    },
  });
}

/**
 * Assign an asset. Rules (PRD §14.5): asset available or reserved for this request item,
 * employee active, asset not already assigned, request item approved and still open.
 */
export async function assignAsset(user: AuthUser, assetId: number, input: AssignInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({
      where: { id: assetId },
      include: { reservations: { where: { status: RESERVATION_STATUS.ACTIVE } } },
    });
    if (!asset) throw notFound("Asset");
    if (asset.status !== ASSET_STATUS.AVAILABLE && asset.status !== ASSET_STATUS.RESERVED) {
      throw conflict(`Asset is ${asset.status.toLowerCase()} and cannot be assigned`);
    }
    if (!asset.warehouseId) throw new AppError("VALIDATION_ERROR", "Asset has no warehouse recorded");

    const employee = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, isActive: true, fullName: true } });
    if (!employee || !employee.isActive) throw new AppError("VALIDATION_ERROR", "Employee is not active");

    const reservation = asset.reservations[0] ?? null;
    let requestItemId = input.requestItemId ?? null;
    if (asset.status === ASSET_STATUS.RESERVED) {
      if (!reservation) throw conflict("Asset is marked reserved but has no active reservation");
      if (requestItemId && requestItemId !== reservation.requestItemId) {
        throw conflict("This asset is reserved for a different request item");
      }
      requestItemId = reservation.requestItemId;
    }

    let requestId: number | null = null;
    if (requestItemId) {
      const item = await tx.hardwareRequestItem.findUnique({
        where: { id: requestItemId },
        include: { request: { select: { id: true, requesterUserId: true, status: true, requestNumber: true } } },
      });
      if (!item) throw notFound("Request item");
      if (!ASSIGNABLE_REQUEST_STATUSES.includes(item.request.status as RequestStatus)) {
        throw conflict(`Request ${item.request.requestNumber} is "${item.request.status}" and cannot receive assets`);
      }
      if (item.request.requesterUserId !== input.userId) {
        throw new AppError("VALIDATION_ERROR", "The asset must be assigned to the employee who made the request");
      }
      if (item.categoryId !== asset.categoryId) throw new AppError("VALIDATION_ERROR", "Asset category does not match the request item");
      if (item.fulfilledQuantity >= item.quantity) throw conflict("This request item is already fully fulfilled");
      requestId = item.request.id;
    }

    const fromStatus = asset.status;
    const r = await tx.asset.updateMany({
      where: { id: asset.id, status: fromStatus },
      data: { status: ASSET_STATUS.ASSIGNED, condition: input.condition },
    });
    if (r.count !== 1) throw conflict("Asset status changed while assigning; please retry");

    if (reservation) {
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: RESERVATION_STATUS.CONSUMED, closedAt: new Date() },
      });
    }
    await moveStock(
      tx,
      asset.categoryId,
      asset.warehouseId,
      1,
      fromStatus === ASSET_STATUS.RESERVED ? "quantityReserved" : "quantityAvailable",
      "quantityIssued"
    );

    const assignment = await tx.assetAssignment.create({
      data: {
        assetId: asset.id,
        userId: input.userId,
        requestItemId,
        conditionAtIssue: input.condition,
        accessories: input.accessories,
        issueNotes: input.notes,
        issuedByUserId: user.id,
      },
    });
    if (requestItemId) {
      await tx.hardwareRequestItem.update({
        where: { id: requestItemId },
        data: { fulfilledQuantity: { increment: 1 } },
      });
    }
    await recordMovementRow(tx, {
      categoryId: asset.categoryId,
      warehouseId: asset.warehouseId,
      assetId: asset.id,
      movementType: MOVEMENT_TYPE.ISSUE,
      quantity: 1,
      referenceType: "asset_assignment",
      referenceId: assignment.id,
      actorId: user.id,
    });
    if (requestId) await recomputeFulfilment(tx, requestId, user.id);

    await notify(tx, {
      recipientUserId: input.userId,
      eventType: NOTIFICATION_EVENT.ASSET_ACK_PENDING,
      title: `Please acknowledge ${asset.assetTag}`,
      body: "An asset has been issued to you. Confirm you have received it.",
      link: "/assets/mine",
    });
    await audit(tx, {
      actorUserId: user.id,
      action: "asset.assign",
      entityType: "asset",
      entityId: asset.id,
      before: { status: fromStatus },
      after: { status: ASSET_STATUS.ASSIGNED, userId: input.userId, requestItemId, assignmentId: assignment.id },
      correlationId,
    });
    return { assignmentId: assignment.id };
  });
}

/** The employee confirms receipt. Only the assignee can acknowledge. */
export async function acknowledgeAssignment(user: AuthUser, assignmentId: number, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.assetAssignment.findUnique({
      where: { id: assignmentId },
      include: { requestItem: { select: { hardwareRequestId: true } } },
    });
    if (!a) throw notFound("Assignment");
    if (a.userId !== user.id) throw forbidden("Only the employee who received the asset can acknowledge it");
    if (!a.isActive) throw conflict("This assignment is closed");
    const r = await tx.assetAssignment.updateMany({
      where: { id: a.id, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
    if (r.count !== 1) throw conflict("Already acknowledged");
    if (a.requestItem) await recomputeFulfilment(tx, a.requestItem.hardwareRequestId, user.id);
    await audit(tx, {
      actorUserId: user.id,
      action: "asset.acknowledge",
      entityType: "asset_assignment",
      entityId: a.id,
      correlationId,
    });
    return { id: a.id };
  });
}

/** Process a return (PRD §14.6). Closes the assignment without deleting history. */
export async function returnAsset(user: AuthUser, assetId: number, input: ReturnInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw notFound("Asset");
    const active = await tx.assetAssignment.findFirst({ where: { assetId, isActive: true } });
    if (!active || asset.status !== ASSET_STATUS.ASSIGNED) throw conflict("This asset has no active assignment");
    if (!asset.warehouseId && !input.warehouseId) throw new AppError("VALIDATION_ERROR", "Choose the receiving warehouse");

    const oldWarehouseId = asset.warehouseId!;
    const newWarehouseId = input.warehouseId ?? oldWarehouseId;

    await tx.assetAssignment.update({
      where: { id: active.id },
      data: {
        isActive: false,
        returnedAt: new Date(),
        conditionAtReturn: input.condition,
        returnAccessories: input.accessories,
        inspectionNotes: input.inspectionNotes,
        returnedToUserId: user.id,
      },
    });
    const r = await tx.asset.updateMany({
      where: { id: asset.id, status: ASSET_STATUS.ASSIGNED },
      data: { status: input.nextStatus, condition: input.condition, warehouseId: newWarehouseId },
    });
    if (r.count !== 1) throw conflict("Asset status changed while returning; please retry");

    // Issued count leaves the original warehouse; the destination counter lands in the receiving one.
    await moveStock(tx, asset.categoryId, oldWarehouseId, 1, "quantityIssued", null);
    const target =
      input.nextStatus === ASSET_STATUS.AVAILABLE
        ? "quantityAvailable"
        : input.nextStatus === ASSET_STATUS.UNDER_MAINTENANCE
          ? "quantityUnderRepair"
          : input.nextStatus === ASSET_STATUS.DAMAGED
            ? "quantityDamaged"
            : null;
    if (target) await moveStock(tx, asset.categoryId, newWarehouseId, 1, null, target);

    await recordMovementRow(tx, {
      categoryId: asset.categoryId,
      warehouseId: newWarehouseId,
      assetId: asset.id,
      movementType: MOVEMENT_TYPE.RETURN,
      quantity: 1,
      reason: `Returned → ${input.nextStatus}`,
      referenceType: "asset_assignment",
      referenceId: active.id,
      actorId: user.id,
    });
    await audit(tx, {
      actorUserId: user.id,
      action: "asset.return",
      entityType: "asset",
      entityId: asset.id,
      before: { status: asset.status, assignmentId: active.id },
      after: { status: input.nextStatus, ...input },
      correlationId,
    });
    return { id: asset.id, status: input.nextStatus };
  });
}
