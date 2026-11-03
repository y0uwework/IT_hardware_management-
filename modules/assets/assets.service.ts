import { randomUUID } from "crypto";
import { execute, getPool, likeContains, type Params, query, queryMany, queryOne, type Tx, Where, withTransaction } from "../../shared/db";
import { AppError, conflict, forbidden, notFound } from "../../shared/errors";
import type { AuthUser } from "../../shared/auth";
import { ASSET_STATUS, MOVEMENT_TYPE, REQUEST_STATUS, type RequestStatus, RESERVATION_STATUS } from "../../shared/config/status.config";
import { appConfig } from "../../shared/config/app.config";
import { audit } from "../../shared/audit";
import { assetCols, assignmentCols, movementCols, reservationCols } from "../../shared/sql-columns";
import { userHas } from "../../middlewares/authorize";
import { moveStock, recordMovementRow } from "../inventory/inventory.service";
import { NOTIFICATION_EVENT, notify } from "../notifications/notifications.service";
import { recomputeFulfilment } from "../requests/requests.service";
import { skipTake } from "../../shared/validation";
import type { AssetCreateInput, AssetListQuery, AssetUpdateInput, AssignInput, ReturnInput } from "./assets.types";

const ASSIGNABLE_REQUEST_STATUSES: RequestStatus[] = [
  REQUEST_STATUS.UNDER_IT_REVIEW,
  REQUEST_STATUS.AWAITING_PROCUREMENT,
  REQUEST_STATUS.PARTIALLY_FULFILLED,
];

interface AssetRow {
  id: number;
  assetTag: string;
  categoryId: number;
  warehouseId: number | null;
  status: string;
  [key: string]: unknown;
}

const dateOrNull = (v: string | null | undefined) => (v ? new Date(v) : null);

async function loadAsset(tx: Tx, id: number) {
  return queryOne<AssetRow>(tx, `SELECT ${assetCols("a")} FROM dbo.assets a WHERE a.id = @id`, { id });
}

export async function registerAsset(user: AuthUser, input: AssetCreateInput, correlationId?: string) {
  return withTransaction((tx) => registerAssetInTx(tx, user, input, correlationId));
}

/**
 * Register one serialized asset inside the caller's transaction (also used by goods receipt,
 * which passes the purchase order line and vendor it came from).
 */
export async function registerAssetInTx(
  tx: Tx,
  user: AuthUser,
  input: AssetCreateInput,
  correlationId?: string,
  source?: { purchaseOrderItemId: number; vendorId: number; reason: string }
) {
  {
    const category = await queryOne<{ name: string; isActive: boolean; isSerialized: boolean }>(
      tx,
      `SELECT name, is_active AS isActive, is_serialized AS isSerialized FROM dbo.hardware_categories WHERE id = @id`,
      { id: input.categoryId }
    );
    if (!category || !category.isActive) throw new AppError("VALIDATION_ERROR", "Category is invalid or inactive");
    if (!category.isSerialized) {
      throw new AppError(
        "VALIDATION_ERROR",
        `"${category.name}" is quantity-tracked. Record a stock receipt in Inventory instead of registering individual assets.`
      );
    }
    const warehouse = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.warehouses WHERE id = @id`, {
      id: input.warehouseId,
    });
    if (!warehouse || !warehouse.isActive) throw new AppError("VALIDATION_ERROR", "Warehouse is invalid or inactive");

    if (input.serialNumber) {
      const dup = await queryOne<{ assetTag: string }>(
        tx,
        `SELECT TOP 1 asset_tag AS assetTag FROM dbo.assets WHERE serial_number = @serialNumber AND category_id = @categoryId`,
        { serialNumber: input.serialNumber, categoryId: input.categoryId }
      );
      if (dup) throw conflict(`Serial number already registered on ${dup.assetTag}`);
    }

    const asset = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.assets
         (asset_tag, serial_number, category_id, manufacturer, model, specification, purchase_date, purchase_cost,
          warranty_end_date, warehouse_id, [condition], status, notes, created_by_user_id)
       OUTPUT INSERTED.id
       VALUES (@tmpTag, @serialNumber, @categoryId, @manufacturer, @model, @specification, @purchaseDate, @purchaseCost,
               @warrantyEndDate, @warehouseId, @condition, @status, @notes, @createdByUserId)`,
      {
        tmpTag: `TMP-${randomUUID().slice(0, 24)}`,
        serialNumber: input.serialNumber,
        categoryId: input.categoryId,
        manufacturer: input.manufacturer,
        model: input.model,
        specification: input.specification,
        purchaseDate: dateOrNull(input.purchaseDate),
        purchaseCost: input.purchaseCost,
        warrantyEndDate: dateOrNull(input.warrantyEndDate),
        warehouseId: input.warehouseId,
        condition: input.condition,
        status: ASSET_STATUS.AVAILABLE,
        notes: input.notes,
        createdByUserId: user.id,
      }
    ))!;
    const assetTag = `${appConfig.assetTagPrefix}-${String(asset.id).padStart(6, "0")}`;
    await execute(
      tx,
      `UPDATE dbo.assets SET asset_tag = @assetTag, purchase_order_item_id = @poItemId, vendor_id = @vendorId WHERE id = @id`,
      { id: asset.id, assetTag, poItemId: source?.purchaseOrderItemId ?? null, vendorId: source?.vendorId ?? null }
    );

    await moveStock(tx, input.categoryId, input.warehouseId, 1, null, "quantityAvailable");
    await recordMovementRow(tx, {
      categoryId: input.categoryId,
      warehouseId: input.warehouseId,
      assetId: asset.id,
      movementType: MOVEMENT_TYPE.RECEIPT,
      quantity: 1,
      reason: source?.reason ?? "Asset registered",
      referenceType: source ? "purchase_order_item" : "asset",
      referenceId: source?.purchaseOrderItemId ?? asset.id,
      actorId: user.id,
    });
    await audit(tx, {
      actorUserId: user.id,
      action: "asset.register",
      entityType: "asset",
      entityId: asset.id,
      after: { assetTag, ...input, ...source },
      correlationId,
    });
    return { id: asset.id, assetTag };
  }
}

export async function updateAsset(user: AuthUser, id: number, input: AssetUpdateInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const before = await loadAsset(tx, id);
    if (!before) throw notFound("Asset");
    const set = ["updated_at = SYSUTCDATETIME()"];
    const params: Params = { id };
    const field = (column: string, value: unknown) => {
      if (value === undefined) return;
      set.push(`${column} = @${column}`);
      params[column] = value;
    };
    field("serial_number", input.serialNumber);
    field("manufacturer", input.manufacturer);
    field("model", input.model);
    field("specification", input.specification);
    field("warranty_end_date", input.warrantyEndDate === undefined ? undefined : dateOrNull(input.warrantyEndDate));
    field("notes", input.notes);
    await execute(tx, `UPDATE dbo.assets SET ${set.join(", ")} WHERE id = @id`, params);
    const after = await loadAsset(tx, id);
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
  const where = new Where();
  if (q.status) where.add("a.status = @status", { status: q.status });
  if (q.categoryId) where.add("a.category_id = @categoryId", { categoryId: q.categoryId });
  if (q.warehouseId) where.add("a.warehouse_id = @warehouseId", { warehouseId: q.warehouseId });
  if (q.search) {
    where.add("(a.asset_tag LIKE @search OR a.serial_number LIKE @search OR a.model LIKE @search OR a.manufacturer LIKE @search)", {
      search: likeContains(q.search),
    });
  }
  const pool = await getPool();
  const [rows, total] = await Promise.all([
    query(
      pool,
      `SELECT ${assetCols("a")}, c.name AS [category.name], w.name AS [warehouse.name],
              cur.userId AS [_current.userId], cur.fullName AS [_current.fullName], cur.acknowledgedAt AS [_current.acknowledgedAt]
       FROM dbo.assets a
       JOIN dbo.hardware_categories c ON c.id = a.category_id
       LEFT JOIN dbo.warehouses w ON w.id = a.warehouse_id
       OUTER APPLY (
         SELECT TOP 1 u.id AS userId, u.full_name AS fullName, aa.acknowledged_at AS acknowledgedAt
         FROM dbo.asset_assignments aa JOIN dbo.users u ON u.id = aa.user_id
         WHERE aa.asset_id = a.id AND aa.is_active = 1
       ) cur
       ${where}
       ORDER BY a.id DESC
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(q) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total FROM dbo.assets a ${where}`, where.params),
  ]);
  const items = rows.map(({ _current, ...asset }) => ({
    ...asset,
    assignments: _current
      ? [{ user: { id: _current.userId, fullName: _current.fullName }, acknowledgedAt: _current.acknowledgedAt }]
      : [],
  }));
  return { items, total: total?.total ?? 0 };
}

export async function getAsset(user: AuthUser, id: number) {
  const [[asset], assignments, reservations, movements] = await queryMany(
    await getPool(),
    `SELECT ${assetCols("a")}, c.id AS [category.id], c.name AS [category.name],
            w.id AS [warehouse.id], w.name AS [warehouse.name], cb.full_name AS [createdBy.fullName]
     FROM dbo.assets a
     JOIN dbo.hardware_categories c ON c.id = a.category_id
     LEFT JOIN dbo.warehouses w ON w.id = a.warehouse_id
     JOIN dbo.users cb ON cb.id = a.created_by_user_id
     WHERE a.id = @id;

     SELECT ${assignmentCols("aa")},
            u.id AS [user.id], u.full_name AS [user.fullName], u.employee_code AS [user.employeeCode],
            ib.full_name AS [issuedBy.fullName], rt.full_name AS [returnedTo.fullName],
            r.id AS [requestItem.request.id], r.request_number AS [requestItem.request.requestNumber]
     FROM dbo.asset_assignments aa
     JOIN dbo.users u ON u.id = aa.user_id
     JOIN dbo.users ib ON ib.id = aa.issued_by_user_id
     LEFT JOIN dbo.users rt ON rt.id = aa.returned_to_user_id
     LEFT JOIN dbo.hardware_request_items i ON i.id = aa.request_item_id
     LEFT JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
     WHERE aa.asset_id = @id
     ORDER BY aa.assigned_at DESC, aa.id DESC;

     SELECT ${reservationCols("res")},
            i.id AS [requestItem.id], r.id AS [requestItem.request.id], r.request_number AS [requestItem.request.requestNumber],
            u.id AS [requestItem.request.requester.id], u.full_name AS [requestItem.request.requester.fullName]
     FROM dbo.inventory_reservations res
     JOIN dbo.hardware_request_items i ON i.id = res.request_item_id
     JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
     JOIN dbo.users u ON u.id = r.requester_user_id
     WHERE res.asset_id = @id AND res.status = @active;

     SELECT TOP 50 ${movementCols("m")}, u.full_name AS [createdBy.fullName], w.name AS [warehouse.name]
     FROM dbo.inventory_movements m
     JOIN dbo.users u ON u.id = m.created_by_user_id
     JOIN dbo.warehouses w ON w.id = m.warehouse_id
     WHERE m.asset_id = @id
     ORDER BY m.created_at DESC, m.id DESC;`,
    { id, active: RESERVATION_STATUS.ACTIVE }
  );
  if (!asset) throw notFound("Asset");
  const isHolder = assignments.some((a) => a.isActive && a.user.id === user.id);
  if (!userHas(user, "asset.view.all") && !isHolder) throw forbidden("You do not have access to this asset");
  return { ...asset, assignments, reservations, movements };
}

export async function myAssets(user: AuthUser) {
  return query(
    await getPool(),
    `SELECT ${assignmentCols("aa")},
            a.id AS [asset.id], a.asset_tag AS [asset.assetTag], a.serial_number AS [asset.serialNumber],
            a.manufacturer AS [asset.manufacturer], a.model AS [asset.model], a.warranty_end_date AS [asset.warrantyEndDate],
            c.name AS [asset.category.name], ib.full_name AS [issuedBy.fullName]
     FROM dbo.asset_assignments aa
     JOIN dbo.assets a ON a.id = aa.asset_id
     JOIN dbo.hardware_categories c ON c.id = a.category_id
     JOIN dbo.users ib ON ib.id = aa.issued_by_user_id
     WHERE aa.user_id = @userId AND aa.is_active = 1
     ORDER BY aa.assigned_at DESC, aa.id DESC`,
    { userId: user.id }
  );
}

/**
 * Assign an asset. Rules (PRD §14.5): asset available or reserved for this request item,
 * employee active, asset not already assigned, request item approved and still open.
 */
export async function assignAsset(user: AuthUser, assetId: number, input: AssignInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const asset = await loadAsset(tx, assetId);
    if (!asset) throw notFound("Asset");
    if (asset.status !== ASSET_STATUS.AVAILABLE && asset.status !== ASSET_STATUS.RESERVED) {
      throw conflict(`Asset is ${asset.status.toLowerCase()} and cannot be assigned`);
    }
    if (!asset.warehouseId) throw new AppError("VALIDATION_ERROR", "Asset has no warehouse recorded");
    const warehouseId = asset.warehouseId;

    const employee = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.users WHERE id = @id`, {
      id: input.userId,
    });
    if (!employee || !employee.isActive) throw new AppError("VALIDATION_ERROR", "Employee is not active");

    const reservation = await queryOne<{ id: number; requestItemId: number }>(
      tx,
      `SELECT TOP 1 id, request_item_id AS requestItemId FROM dbo.inventory_reservations
       WHERE asset_id = @assetId AND status = @active ORDER BY id`,
      { assetId, active: RESERVATION_STATUS.ACTIVE }
    );
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
      const item = await queryOne<{
        categoryId: number;
        quantity: number;
        fulfilledQuantity: number;
        request: { id: number; requesterUserId: number; status: string; requestNumber: string };
      }>(
        tx,
        `SELECT i.category_id AS categoryId, i.quantity, i.fulfilled_quantity AS fulfilledQuantity,
                r.id AS [request.id], r.requester_user_id AS [request.requesterUserId], r.status AS [request.status],
                r.request_number AS [request.requestNumber]
         FROM dbo.hardware_request_items i JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
         WHERE i.id = @id`,
        { id: requestItemId }
      );
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
    const count = await execute(
      tx,
      `UPDATE dbo.assets SET status = @assigned, [condition] = @condition, updated_at = SYSUTCDATETIME()
       WHERE id = @id AND status = @fromStatus`,
      { id: asset.id, assigned: ASSET_STATUS.ASSIGNED, condition: input.condition, fromStatus }
    );
    if (count !== 1) throw conflict("Asset status changed while assigning; please retry");

    if (reservation) {
      await execute(
        tx,
        `UPDATE dbo.inventory_reservations SET status = @consumed, closed_at = SYSUTCDATETIME() WHERE id = @id`,
        { id: reservation.id, consumed: RESERVATION_STATUS.CONSUMED }
      );
    }
    await moveStock(
      tx,
      asset.categoryId,
      warehouseId,
      1,
      fromStatus === ASSET_STATUS.RESERVED ? "quantityReserved" : "quantityAvailable",
      "quantityIssued"
    );

    const assignment = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.asset_assignments (asset_id, user_id, request_item_id, condition_at_issue, accessories, issue_notes, issued_by_user_id)
       OUTPUT INSERTED.id
       VALUES (@assetId, @userId, @requestItemId, @condition, @accessories, @notes, @issuedByUserId)`,
      {
        assetId: asset.id,
        userId: input.userId,
        requestItemId,
        condition: input.condition,
        accessories: input.accessories,
        notes: input.notes,
        issuedByUserId: user.id,
      }
    ))!;
    if (requestItemId) {
      await execute(tx, `UPDATE dbo.hardware_request_items SET fulfilled_quantity = fulfilled_quantity + 1 WHERE id = @id`, {
        id: requestItemId,
      });
    }
    await recordMovementRow(tx, {
      categoryId: asset.categoryId,
      warehouseId,
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
  return withTransaction(async (tx) => {
    const a = await queryOne<{ id: number; userId: number; isActive: boolean; hardwareRequestId: number | null }>(
      tx,
      `SELECT aa.id, aa.user_id AS userId, aa.is_active AS isActive, i.hardware_request_id AS hardwareRequestId
       FROM dbo.asset_assignments aa LEFT JOIN dbo.hardware_request_items i ON i.id = aa.request_item_id
       WHERE aa.id = @id`,
      { id: assignmentId }
    );
    if (!a) throw notFound("Assignment");
    if (a.userId !== user.id) throw forbidden("Only the employee who received the asset can acknowledge it");
    if (!a.isActive) throw conflict("This assignment is closed");
    const count = await execute(
      tx,
      `UPDATE dbo.asset_assignments SET acknowledged_at = SYSUTCDATETIME() WHERE id = @id AND acknowledged_at IS NULL`,
      { id: a.id }
    );
    if (count !== 1) throw conflict("Already acknowledged");
    if (a.hardwareRequestId) await recomputeFulfilment(tx, a.hardwareRequestId, user.id);
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
  return withTransaction(async (tx) => {
    const asset = await loadAsset(tx, assetId);
    if (!asset) throw notFound("Asset");
    const active = await queryOne<{ id: number }>(
      tx,
      `SELECT TOP 1 id FROM dbo.asset_assignments WHERE asset_id = @assetId AND is_active = 1`,
      { assetId }
    );
    if (!active || asset.status !== ASSET_STATUS.ASSIGNED) throw conflict("This asset has no active assignment");
    if (!asset.warehouseId && !input.warehouseId) throw new AppError("VALIDATION_ERROR", "Choose the receiving warehouse");

    const oldWarehouseId = asset.warehouseId!;
    const newWarehouseId = input.warehouseId ?? oldWarehouseId;

    await execute(
      tx,
      `UPDATE dbo.asset_assignments
       SET is_active = 0, returned_at = SYSUTCDATETIME(), condition_at_return = @condition,
           return_accessories = @accessories, inspection_notes = @inspectionNotes, returned_to_user_id = @returnedToUserId
       WHERE id = @id`,
      {
        id: active.id,
        condition: input.condition,
        accessories: input.accessories,
        inspectionNotes: input.inspectionNotes,
        returnedToUserId: user.id,
      }
    );
    const count = await execute(
      tx,
      `UPDATE dbo.assets SET status = @nextStatus, [condition] = @condition, warehouse_id = @warehouseId, updated_at = SYSUTCDATETIME()
       WHERE id = @id AND status = @assigned`,
      { id: asset.id, nextStatus: input.nextStatus, condition: input.condition, warehouseId: newWarehouseId, assigned: ASSET_STATUS.ASSIGNED }
    );
    if (count !== 1) throw conflict("Asset status changed while returning; please retry");

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
