import { Where, execute, getPool, likeContains, query, queryOne, withTransaction, type Tx } from "../../lib/db";
import { AppError, conflict, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import { ASSET_STATUS, MOVEMENT_TYPE, RESERVATION_STATUS } from "../../config/status.config";
import { appConfig } from "../../config/app.config";
import { audit } from "../utils/audit";
import { movementCols, reservationCols, stockCols } from "../utils/sql-columns";
import { skipTake, type Pagination } from "../../lib/validation";

type Counter = "quantityAvailable" | "quantityReserved" | "quantityIssued" | "quantityDamaged" | "quantityUnderRepair";

const COUNTER_COLUMN: Record<Counter, string> = {
  quantityAvailable: "quantity_available",
  quantityReserved: "quantity_reserved",
  quantityIssued: "quantity_issued",
  quantityDamaged: "quantity_damaged",
  quantityUnderRepair: "quantity_under_repair",
};

export interface Reservation {
  id: number;
  requestItemId: number;
  categoryId: number;
  warehouseId: number;
  assetId: number | null;
  quantity: number;
  status: string;
  expiresAt: Date | null;
  createdByUserId: number;
  createdAt: Date;
  closedAt: Date | null;
}

async function ensureStockRow(tx: Tx, categoryId: number, warehouseId: number) {
  await execute(
    tx,
    `IF NOT EXISTS (SELECT 1 FROM dbo.inventory_stock WITH (UPDLOCK, HOLDLOCK)
                    WHERE category_id = @categoryId AND warehouse_id = @warehouseId)
       INSERT INTO dbo.inventory_stock (category_id, warehouse_id) VALUES (@categoryId, @warehouseId)`,
    { categoryId, warehouseId }
  );
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
  const set = ["updated_at = SYSUTCDATETIME()"];
  if (from) set.push(`${COUNTER_COLUMN[from]} = ${COUNTER_COLUMN[from]} - @qty`);
  if (to) set.push(`${COUNTER_COLUMN[to]} = ${COUNTER_COLUMN[to]} + @qty`);
  const count = await execute(
    tx,
    `UPDATE dbo.inventory_stock SET ${set.join(", ")}
     WHERE category_id = @categoryId AND warehouse_id = @warehouseId${from ? ` AND ${COUNTER_COLUMN[from]} >= @qty` : ""}`,
    { categoryId, warehouseId, qty }
  );
  if (count !== 1) throw conflict("Not enough stock available for this operation");
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
  await execute(
    tx,
    `INSERT INTO dbo.inventory_movements
       (category_id, warehouse_id, asset_id, movement_type, quantity, reason, reference_type, reference_id, created_by_user_id)
     VALUES (@categoryId, @warehouseId, @assetId, @movementType, @quantity, @reason, @referenceType, @referenceId, @actorId)`,
    {
      categoryId: m.categoryId,
      warehouseId: m.warehouseId,
      assetId: m.assetId ?? null,
      movementType: m.movementType,
      quantity: m.quantity,
      reason: m.reason ?? null,
      referenceType: m.referenceType ?? null,
      referenceId: m.referenceId ?? null,
      actorId: m.actorId,
    }
  );
}

async function insertReservation(
  tx: Tx,
  r: { requestItemId: number; categoryId: number; warehouseId: number; assetId: number | null; quantity: number; expiresAt: Date; actorId: number }
) {
  const row = await queryOne<{ id: number }>(
    tx,
    `INSERT INTO dbo.inventory_reservations
       (request_item_id, category_id, warehouse_id, asset_id, quantity, status, expires_at, created_by_user_id)
     OUTPUT INSERTED.id
     VALUES (@requestItemId, @categoryId, @warehouseId, @assetId, @quantity, @status, @expiresAt, @actorId)`,
    { ...r, status: RESERVATION_STATUS.ACTIVE }
  );
  return row!.id;
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
    const candidates = await query<{ id: number }>(
      tx,
      `SELECT TOP (@take) id FROM dbo.assets
       WHERE category_id = @categoryId AND warehouse_id = @warehouseId AND status = @available
       ORDER BY id`,
      { take: quantity * 3, categoryId: item.categoryId, warehouseId, available: ASSET_STATUS.AVAILABLE }
    );
    const reserved: number[] = [];
    for (const c of candidates) {
      if (reserved.length === quantity) break;
      const count = await execute(
        tx,
        `UPDATE dbo.assets SET status = @reserved, updated_at = SYSUTCDATETIME() WHERE id = @id AND status = @available`,
        { id: c.id, reserved: ASSET_STATUS.RESERVED, available: ASSET_STATUS.AVAILABLE }
      );
      if (count === 1) reserved.push(c.id);
    }
    if (reserved.length < quantity) {
      throw conflict(`Only ${reserved.length} matching asset(s) are available in that warehouse`);
    }
    for (const assetId of reserved) {
      await moveStock(tx, item.categoryId, warehouseId, 1, "quantityAvailable", "quantityReserved");
      const reservationId = await insertReservation(tx, {
        requestItemId: item.id,
        categoryId: item.categoryId,
        warehouseId,
        assetId,
        quantity: 1,
        expiresAt,
        actorId: actor.id,
      });
      await recordMovementRow(tx, {
        categoryId: item.categoryId,
        warehouseId,
        assetId,
        movementType: MOVEMENT_TYPE.RESERVE,
        quantity: 1,
        referenceType: "inventory_reservation",
        referenceId: reservationId,
        actorId: actor.id,
      });
    }
  } else {
    await moveStock(tx, item.categoryId, warehouseId, quantity, "quantityAvailable", "quantityReserved");
    const reservationId = await insertReservation(tx, {
      requestItemId: item.id,
      categoryId: item.categoryId,
      warehouseId,
      assetId: null,
      quantity,
      expiresAt,
      actorId: actor.id,
    });
    await recordMovementRow(tx, {
      categoryId: item.categoryId,
      warehouseId,
      movementType: MOVEMENT_TYPE.RESERVE,
      quantity,
      referenceType: "inventory_reservation",
      referenceId: reservationId,
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

async function closeReservation(tx: Tx, id: number, status: string) {
  return execute(
    tx,
    `UPDATE dbo.inventory_reservations SET status = @status, closed_at = SYSUTCDATETIME() WHERE id = @id AND status = @active`,
    { id, status, active: RESERVATION_STATUS.ACTIVE }
  );
}

/** Release an active reservation back to available stock. */
export async function releaseReservation(tx: Tx, actor: AuthUser, reservationId: number, reason: string, correlationId?: string) {
  const res = await queryOne<Reservation>(tx, `SELECT ${reservationCols("r")} FROM dbo.inventory_reservations r WHERE r.id = @id`, {
    id: reservationId,
  });
  if (!res) throw notFound("Reservation");
  if ((await closeReservation(tx, res.id, RESERVATION_STATUS.RELEASED)) !== 1) {
    throw conflict(`Reservation is ${res.status.toLowerCase()}, not active`);
  }

  if (res.assetId) {
    const count = await execute(
      tx,
      `UPDATE dbo.assets SET status = @available, updated_at = SYSUTCDATETIME() WHERE id = @id AND status = @reserved`,
      { id: res.assetId, available: ASSET_STATUS.AVAILABLE, reserved: ASSET_STATUS.RESERVED }
    );
    if (count !== 1) throw conflict("The reserved asset is no longer in Reserved status");
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
  const res = await queryOne<Reservation & { category: { isSerialized: boolean } }>(
    tx,
    `SELECT ${reservationCols("r")}, c.is_serialized AS [category.isSerialized]
     FROM dbo.inventory_reservations r JOIN dbo.hardware_categories c ON c.id = r.category_id
     WHERE r.id = @id`,
    { id: reservationId }
  );
  if (!res) throw notFound("Reservation");
  if (res.assetId || res.category.isSerialized) {
    throw new AppError("VALIDATION_ERROR", "Serialized assets are issued through asset assignment");
  }
  if ((await closeReservation(tx, res.id, RESERVATION_STATUS.CONSUMED)) !== 1) {
    throw conflict(`Reservation is ${res.status.toLowerCase()}, not active`);
  }

  await moveStock(tx, res.categoryId, res.warehouseId, res.quantity, "quantityReserved", "quantityIssued");
  await execute(tx, `UPDATE dbo.hardware_request_items SET fulfilled_quantity = fulfilled_quantity + @qty WHERE id = @id`, {
    id: res.requestItemId,
    qty: res.quantity,
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
  return withTransaction(async (tx) => {
    const category = await queryOne<{ isSerialized: boolean }>(
      tx,
      `SELECT is_serialized AS isSerialized FROM dbo.hardware_categories WHERE id = @id`,
      { id: input.categoryId }
    );
    if (!category) throw notFound("Category");
    if (category.isSerialized) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Stock for serialized categories changes through asset registration and returns"
      );
    }
    const warehouse = await queryOne(tx, `SELECT id FROM dbo.warehouses WHERE id = @id`, { id: input.warehouseId });
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
  const where = new Where();
  if (p.categoryId) where.add("s.category_id = @categoryId", { categoryId: p.categoryId });
  if (p.warehouseId) where.add("s.warehouse_id = @warehouseId", { warehouseId: p.warehouseId });
  if (p.search) where.add("c.name LIKE @search", { search: likeContains(p.search) });
  const from = `FROM dbo.inventory_stock s
    JOIN dbo.hardware_categories c ON c.id = s.category_id
    JOIN dbo.warehouses w ON w.id = s.warehouse_id
    ${where}`;
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT ${stockCols("s")},
              c.id AS [category.id], c.name AS [category.name], c.code AS [category.code], c.is_serialized AS [category.isSerialized],
              w.id AS [warehouse.id], w.name AS [warehouse.name], w.code AS [warehouse.code]
       ${from}
       ORDER BY c.name, w.name, s.id
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(p) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${from}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

/** Available quantity per warehouse for one category (used by IT review). */
export async function availability(categoryId: number) {
  return query(
    await getPool(),
    `SELECT s.quantity_available AS quantityAvailable, w.id AS [warehouse.id], w.name AS [warehouse.name], w.code AS [warehouse.code]
     FROM dbo.inventory_stock s JOIN dbo.warehouses w ON w.id = s.warehouse_id
     WHERE s.category_id = @categoryId AND s.quantity_available > 0 AND w.is_active = 1
     ORDER BY s.quantity_available DESC, w.id`,
    { categoryId }
  );
}

export async function listReservations(p: Pagination & { status?: string }) {
  const where = new Where();
  if (p.status) where.add("res.status = @status", { status: p.status });
  if (p.search) where.add("(r.request_number LIKE @search OR a.asset_tag LIKE @search)", { search: likeContains(p.search) });
  const from = `FROM dbo.inventory_reservations res
    JOIN dbo.hardware_categories c ON c.id = res.category_id
    JOIN dbo.warehouses w ON w.id = res.warehouse_id
    LEFT JOIN dbo.assets a ON a.id = res.asset_id
    JOIN dbo.hardware_request_items i ON i.id = res.request_item_id
    JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
    JOIN dbo.users u ON u.id = r.requester_user_id
    ${where}`;
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT ${reservationCols("res")},
              c.name AS [category.name], c.is_serialized AS [category.isSerialized],
              w.name AS [warehouse.name],
              a.id AS [asset.id], a.asset_tag AS [asset.assetTag],
              i.id AS [requestItem.id], r.id AS [requestItem.request.id], r.request_number AS [requestItem.request.requestNumber],
              u.id AS [requestItem.request.requester.id], u.full_name AS [requestItem.request.requester.fullName]
       ${from}
       ORDER BY res.created_at DESC, res.id DESC
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(p) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${from}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

export async function listMovements(p: Pagination) {
  const where = new Where();
  if (p.search) where.add("(c.name LIKE @search OR a.asset_tag LIKE @search)", { search: likeContains(p.search) });
  const from = `FROM dbo.inventory_movements m
    JOIN dbo.hardware_categories c ON c.id = m.category_id
    JOIN dbo.warehouses w ON w.id = m.warehouse_id
    LEFT JOIN dbo.assets a ON a.id = m.asset_id
    JOIN dbo.users u ON u.id = m.created_by_user_id
    ${where}`;
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT ${movementCols("m")}, c.name AS [category.name], w.name AS [warehouse.name],
              a.asset_tag AS [asset.assetTag], u.full_name AS [createdBy.fullName]
       ${from}
       ORDER BY m.created_at DESC, m.id DESC
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(p) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${from}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}
