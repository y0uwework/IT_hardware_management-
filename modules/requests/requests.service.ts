import { randomUUID } from "crypto";
import { execute, getPool, likeContains, query, queryMany, queryOne, type Tx, Where, withTransaction } from "../../shared/db";
import { AppError, conflict, forbidden, invalidTransition, notFound } from "../../shared/errors";
import type { AuthUser } from "../../shared/auth";
import { canTransition, ITEM_FULFILMENT_STATUS, REQUEST_STATUS, REQUEST_TRANSITIONS, type RequestStatus, RESERVATION_STATUS } from "../../shared/config/status.config";
import { appConfig } from "../../shared/config/app.config";
import { audit } from "../../shared/audit";
import { assignmentCols, historyCols, itemCols, requestCols, reservationCols, taskCols } from "../../shared/sql-columns";
import { userHas } from "../../middlewares/authorize";
import { NOTIFICATION_EVENT, notify } from "../notifications/notifications.service";
import { recordHistory, skipOpenTasks, startApproval } from "../approvals/approvals.service";
import { reserveForItem } from "../inventory/inventory.service";
import { deriveRequestStatus, itemFulfilmentStatus, type ItemState, remainingToPlan } from "./requests.rules";
import { skipTake } from "../../shared/validation";
import type { ItReviewInput, RequestInput, RequestListQuery } from "./requests.types";

const EDITABLE: RequestStatus[] = [REQUEST_STATUS.DRAFT, REQUEST_STATUS.RETURNED];
const CANCELLABLE: RequestStatus[] = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.PENDING_APPROVAL,
  REQUEST_STATUS.RETURNED,
  REQUEST_STATUS.APPROVED,
];
const IT_REVIEWABLE: RequestStatus[] = [
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.UNDER_IT_REVIEW,
  REQUEST_STATUS.AWAITING_PROCUREMENT,
  REQUEST_STATUS.PARTIALLY_FULFILLED,
];

interface RequestHeader {
  id: number;
  requestNumber: string;
  requesterUserId: number;
  status: string;
  purpose: string;
}

const HEADER_SELECT = `id, request_number AS requestNumber, requester_user_id AS requesterUserId, status, purpose`;

function transition(from: string, to: RequestStatus): RequestStatus {
  if (!canTransition(REQUEST_TRANSITIONS, from as RequestStatus, to)) throw invalidTransition(from, to);
  return to;
}

async function loadHeader(tx: Tx, id: number) {
  return queryOne<RequestHeader>(tx, `SELECT ${HEADER_SELECT} FROM dbo.hardware_requests WITH (UPDLOCK) WHERE id = @id`, { id });
}

async function setStatus(tx: Tx, id: number, status: string, extra = "") {
  await execute(tx, `UPDATE dbo.hardware_requests SET status = @status, updated_at = SYSUTCDATETIME()${extra} WHERE id = @id`, {
    id,
    status,
  });
}

/** Record-level scope: who may see which requests. */
function visibilityWhere(user: AuthUser, scope: RequestListQuery["scope"], where: Where) {
  if (scope === "all") {
    if (!userHas(user, "request.view.all")) throw forbidden();
    return;
  }
  if (scope === "it-queue") {
    if (!userHas(user, "request.it_review")) throw forbidden();
    where.add("r.status IN (@itStatuses)", { itStatuses: IT_REVIEWABLE });
    return;
  }
  where.add("r.requester_user_id = @userId", { userId: user.id });
}

async function assertCanView(user: AuthUser, request: { id: number; requesterUserId: number; status: string }) {
  if (request.requesterUserId === user.id) return;
  if (userHas(user, "request.view.all")) return;
  if (userHas(user, "request.it_review") && IT_REVIEWABLE.includes(request.status as RequestStatus)) return;
  if (userHas(user, "request.it_review") && request.status === REQUEST_STATUS.FULFILLED) return;
  const task = await queryOne(
    await getPool(),
    `SELECT TOP 1 id FROM dbo.approval_tasks WHERE hardware_request_id = @requestId AND approver_user_id = @userId`,
    { requestId: request.id, userId: user.id }
  );
  if (task) return;
  throw forbidden("You do not have access to this request");
}

export async function listRequests(user: AuthUser, q: RequestListQuery) {
  const where = new Where();
  visibilityWhere(user, q.scope, where);
  // Combined with the it-queue status set above, a status outside that set matches nothing.
  if (q.status) where.add("r.status = @status", { status: q.status });
  if (q.search) {
    where.add("(r.request_number LIKE @search OR r.purpose LIKE @search OR u.full_name LIKE @search)", {
      search: likeContains(q.search),
    });
  }
  const from = `FROM dbo.hardware_requests r JOIN dbo.users u ON u.id = r.requester_user_id ${where}`;
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT r.id, r.request_number AS requestNumber, r.request_type AS requestType, r.purpose, r.priority, r.status,
              r.required_date AS requiredDate, r.submitted_at AS submittedAt, r.created_at AS createdAt,
              u.id AS [requester.id], u.full_name AS [requester.fullName], u.department AS [requester.department],
              (SELECT COUNT(*) FROM dbo.hardware_request_items i WHERE i.hardware_request_id = r.id) AS [_count.items]
       ${from}
       ORDER BY r.created_at DESC, r.id DESC
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(q) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${from}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

export async function getRequest(user: AuthUser, id: number) {
  const pool = await getPool();
  const request = await queryOne(
    pool,
    `SELECT ${requestCols("r")},
            u.id AS [requester.id], u.full_name AS [requester.fullName], u.employee_code AS [requester.employeeCode],
            u.department AS [requester.department], u.designation AS [requester.designation], u.email AS [requester.email],
            w.name AS [workflow.name], w.version AS [workflow.version]
     FROM dbo.hardware_requests r
     JOIN dbo.users u ON u.id = r.requester_user_id
     LEFT JOIN dbo.approval_workflows w ON w.id = r.workflow_id
     WHERE r.id = @id`,
    { id }
  );
  if (!request) throw notFound("Request");
  await assertCanView(user, request as { id: number; requesterUserId: number; status: string });

  const [items, reservations, assignments, tasks, history] = await queryMany(
    pool,
    `SELECT ${itemCols("i")},
            c.id AS [category.id], c.name AS [category.name], c.is_serialized AS [category.isSerialized],
            im.id AS [item.id], im.item_code AS [item.code], im.item_name AS [item.name],
            rv.full_name AS [reviewedBy.fullName]
     FROM dbo.hardware_request_items i
     JOIN dbo.hardware_categories c ON c.id = i.category_id
     LEFT JOIN dbo.item_master im ON im.id = i.item_id
     LEFT JOIN dbo.users rv ON rv.id = i.reviewed_by_user_id
     WHERE i.hardware_request_id = @id
     ORDER BY i.id;

     SELECT ${reservationCols("res")}, wh.name AS [warehouse.name], a.id AS [asset.id], a.asset_tag AS [asset.assetTag]
     FROM dbo.inventory_reservations res
     JOIN dbo.hardware_request_items i ON i.id = res.request_item_id
     JOIN dbo.warehouses wh ON wh.id = res.warehouse_id
     LEFT JOIN dbo.assets a ON a.id = res.asset_id
     WHERE i.hardware_request_id = @id
     ORDER BY res.created_at, res.id;

     SELECT ${assignmentCols("aa")}, a.id AS [asset.id], a.asset_tag AS [asset.assetTag], a.model AS [asset.model]
     FROM dbo.asset_assignments aa
     JOIN dbo.hardware_request_items i ON i.id = aa.request_item_id
     JOIN dbo.assets a ON a.id = aa.asset_id
     WHERE i.hardware_request_id = @id
     ORDER BY aa.assigned_at, aa.id;

     SELECT ${taskCols("t")}, ap.full_name AS [approver.fullName], s.name AS [stage.name], s.stage_order AS [stage.stageOrder]
     FROM dbo.approval_tasks t
     JOIN dbo.users ap ON ap.id = t.approver_user_id
     JOIN dbo.approval_workflow_stages s ON s.id = t.stage_id
     WHERE t.hardware_request_id = @id
     ORDER BY t.cycle, t.created_at, t.id;

     SELECT ${historyCols("h")}, ac.full_name AS [actor.fullName]
     FROM dbo.approval_history h
     JOIN dbo.users ac ON ac.id = h.actor_user_id
     WHERE h.hardware_request_id = @id
     ORDER BY h.created_at, h.id;`,
    { id }
  );

  return {
    ...request,
    items: items.map((item) => ({
      ...item,
      reservations: reservations.filter((r) => r.requestItemId === item.id),
      assignments: assignments.filter((a) => a.requestItemId === item.id),
    })),
    tasks,
    history,
  };
}

async function insertItems(tx: Tx, requestId: number, items: RequestInput["items"], categoryByItem: Map<number, number>) {
  for (const i of items) {
    await execute(
      tx,
      `INSERT INTO dbo.hardware_request_items
         (hardware_request_id, item_id, category_id, quantity, requested_specification, estimated_unit_price, fulfilment_status)
       VALUES (@requestId, @itemId, @categoryId, @quantity, @requestedSpecification, @estimatedUnitPrice, @fulfilmentStatus)`,
      {
        requestId,
        itemId: i.itemId,
        categoryId: categoryByItem.get(i.itemId)!,
        quantity: i.quantity,
        requestedSpecification: i.requestedSpecification,
        estimatedUnitPrice: i.estimatedUnitPrice,
        fulfilmentStatus: ITEM_FULFILMENT_STATUS.PENDING,
      }
    );
  }
}

/**
 * Every requested item must be an active, non-deleted item master record in an active category.
 * Returns item id → category id; stock and fulfilment stay keyed by category.
 */
async function resolveItems(tx: Tx, items: RequestInput["items"]) {
  const ids = Array.from(new Set(items.map((i) => i.itemId)));
  const rows = await query<{ id: number; categoryId: number }>(
    tx,
    `SELECT im.id, im.category_id AS categoryId
     FROM dbo.item_master im JOIN dbo.hardware_categories c ON c.id = im.category_id
     WHERE im.id IN (@ids) AND im.is_deleted = 0 AND im.is_active = 1 AND c.is_active = 1`,
    { ids }
  );
  const map = new Map(rows.map((r) => [r.id, r.categoryId]));
  const errors = items
    .map((it, idx) => (map.has(it.itemId) ? null : { path: `items.${idx}.itemId`, message: "This item is no longer available" }))
    .filter((e): e is { path: string; message: string } => e !== null);
  if (errors.length) throw new AppError("VALIDATION_ERROR", "One or more items are invalid or inactive", errors);
  return map;
}

async function submitInTx(tx: Tx, user: AuthUser, requestId: number, from: string, correlationId?: string) {
  const status = transition(from, REQUEST_STATUS.PENDING_APPROVAL);
  await setStatus(tx, requestId, status, ", submitted_at = SYSUTCDATETIME()");
  const request = (await loadHeader(tx, requestId))!;
  await recordHistory(tx, {
    hardwareRequestId: requestId,
    actorUserId: user.id,
    action: from === REQUEST_STATUS.RETURNED ? "Resubmitted" : "Submitted",
  });
  await startApproval(tx, requestId, user);
  await notify(tx, {
    recipientUserId: user.id,
    eventType: NOTIFICATION_EVENT.REQUEST_SUBMITTED,
    title: `${request.requestNumber} submitted`,
    body: "Your request has entered the approval workflow.",
    link: `/requests/${requestId}`,
  });
  await audit(tx, {
    actorUserId: user.id,
    action: "request.submit",
    entityType: "hardware_request",
    entityId: requestId,
    before: { status: from },
    after: { status },
    correlationId,
  });
}

const dateOrNull = (v: string | null | undefined) => (v ? new Date(v) : null);

export async function createRequest(user: AuthUser, input: RequestInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const categoryByItem = await resolveItems(tx, input.items);
    const year = new Date().getFullYear();
    const created = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.hardware_requests
         (request_number, requester_user_id, request_type, purpose, justification, priority, required_date, cost_centre, status)
       OUTPUT INSERTED.id
       VALUES (@tmpNumber, @requesterUserId, @requestType, @purpose, @justification, @priority, @requiredDate, @costCentre, @status)`,
      {
        // Temporary unique value; replaced with the sequential number below.
        tmpNumber: `TMP-${randomUUID().slice(0, 24)}`,
        requesterUserId: user.id,
        requestType: input.requestType,
        purpose: input.purpose,
        justification: input.justification ?? null,
        priority: input.priority,
        requiredDate: dateOrNull(input.requiredDate),
        costCentre: input.costCentre ?? null,
        status: REQUEST_STATUS.DRAFT,
      }
    ))!;
    const requestNumber = `${appConfig.requestNumberPrefix}-${year}-${String(created.id).padStart(6, "0")}`;
    await execute(tx, `UPDATE dbo.hardware_requests SET request_number = @requestNumber WHERE id = @id`, {
      id: created.id,
      requestNumber,
    });
    await insertItems(tx, created.id, input.items, categoryByItem);
    await audit(tx, {
      actorUserId: user.id,
      action: "request.create",
      entityType: "hardware_request",
      entityId: created.id,
      after: { requestNumber, ...input },
      correlationId,
    });
    if (input.submit) await submitInTx(tx, user, created.id, REQUEST_STATUS.DRAFT, correlationId);
    return { id: created.id, requestNumber };
  });
}

async function countItems(tx: Tx, requestId: number) {
  const row = await queryOne<{ n: number }>(tx, `SELECT COUNT(*) AS n FROM dbo.hardware_request_items WHERE hardware_request_id = @requestId`, {
    requestId,
  });
  return row?.n ?? 0;
}

export async function updateRequest(user: AuthUser, id: number, input: RequestInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const existing = await loadHeader(tx, id);
    if (!existing) throw notFound("Request");
    if (existing.requesterUserId !== user.id) throw forbidden("Only the requester can edit this request");
    if (!EDITABLE.includes(existing.status as RequestStatus)) {
      throw conflict(`Requests in "${existing.status}" status cannot be edited`);
    }
    const itemsBefore = await countItems(tx, id);
    const categoryByItem = await resolveItems(tx, input.items);
    await execute(tx, `DELETE FROM dbo.hardware_request_items WHERE hardware_request_id = @id`, { id });
    await execute(
      tx,
      `UPDATE dbo.hardware_requests
       SET request_type = @requestType, purpose = @purpose, justification = @justification, priority = @priority,
           required_date = @requiredDate, cost_centre = @costCentre, updated_at = SYSUTCDATETIME()
       WHERE id = @id`,
      {
        id,
        requestType: input.requestType,
        purpose: input.purpose,
        justification: input.justification ?? null,
        priority: input.priority,
        requiredDate: dateOrNull(input.requiredDate),
        costCentre: input.costCentre ?? null,
      }
    );
    await insertItems(tx, id, input.items, categoryByItem);
    await audit(tx, {
      actorUserId: user.id,
      action: "request.update",
      entityType: "hardware_request",
      entityId: id,
      before: { purpose: existing.purpose, items: itemsBefore },
      after: input,
      correlationId,
    });
    if (input.submit) await submitInTx(tx, user, id, existing.status, correlationId);
    return { id, requestNumber: existing.requestNumber };
  });
}

export async function submitRequest(user: AuthUser, id: number, correlationId?: string) {
  return withTransaction(async (tx) => {
    const existing = await loadHeader(tx, id);
    if (!existing) throw notFound("Request");
    if (existing.requesterUserId !== user.id) throw forbidden("Only the requester can submit this request");
    if (!EDITABLE.includes(existing.status as RequestStatus)) {
      throw conflict(`Requests in "${existing.status}" status cannot be submitted`);
    }
    if ((await countItems(tx, id)) === 0) throw new AppError("VALIDATION_ERROR", "Add at least one item before submitting");
    await submitInTx(tx, user, id, existing.status, correlationId);
    return { id };
  });
}

export async function cancelRequest(user: AuthUser, id: number, reason: string | undefined, correlationId?: string) {
  return withTransaction(async (tx) => {
    const existing = await loadHeader(tx, id);
    if (!existing) throw notFound("Request");
    if (existing.requesterUserId !== user.id) throw forbidden("Only the requester can cancel this request");
    if (!CANCELLABLE.includes(existing.status as RequestStatus)) {
      throw conflict(`Requests in "${existing.status}" status cannot be cancelled`);
    }
    const status = transition(existing.status, REQUEST_STATUS.CANCELLED);
    await skipOpenTasks(tx, id);
    await setStatus(tx, id, status);
    await execute(tx, `UPDATE dbo.hardware_request_items SET fulfilment_status = @cancelled WHERE hardware_request_id = @id`, {
      id,
      cancelled: ITEM_FULFILMENT_STATUS.CANCELLED,
    });
    await recordHistory(tx, { hardwareRequestId: id, actorUserId: user.id, action: "Cancelled", comments: reason ?? null });
    await audit(tx, {
      actorUserId: user.id,
      action: "request.cancel",
      entityType: "hardware_request",
      entityId: id,
      before: { status: existing.status },
      after: { status, reason },
      correlationId,
    });
    return { id, status };
  });
}

/** Snapshot the fulfilment state of every item on a request. */
async function loadItemStates(tx: Tx, requestId: number) {
  const items = await query<{
    id: number;
    fulfilmentStatus: string;
    quantity: number;
    fulfilledQuantity: number;
    procurementQuantity: number;
    activeReservedQuantity: number;
    unacknowledgedAssignments: number;
  }>(
    tx,
    `SELECT i.id, i.fulfilment_status AS fulfilmentStatus, i.quantity, i.fulfilled_quantity AS fulfilledQuantity,
            i.procurement_quantity AS procurementQuantity,
            (SELECT COALESCE(SUM(res.quantity), 0) FROM dbo.inventory_reservations res
              WHERE res.request_item_id = i.id AND res.status = @active) AS activeReservedQuantity,
            (SELECT COUNT(*) FROM dbo.asset_assignments aa
              WHERE aa.request_item_id = i.id AND aa.acknowledged_at IS NULL AND aa.is_active = 1)
            + (SELECT COUNT(*) FROM dbo.inventory_reservations iss
              WHERE iss.request_item_id = i.id AND iss.status = @consumed AND iss.asset_id IS NULL
                AND iss.acknowledged_at IS NULL) AS unacknowledgedAssignments
     FROM dbo.hardware_request_items i
     WHERE i.hardware_request_id = @requestId`,
    { requestId, active: RESERVATION_STATUS.ACTIVE, consumed: RESERVATION_STATUS.CONSUMED }
  );
  return items.map((i) => ({
    id: i.id,
    fulfilmentStatus: i.fulfilmentStatus,
    state: {
      quantity: i.quantity,
      fulfilledQuantity: i.fulfilledQuantity,
      procurementQuantity: i.procurementQuantity,
      activeReservedQuantity: i.activeReservedQuantity,
      unacknowledgedAssignments: i.unacknowledgedAssignments,
    } satisfies ItemState,
  }));
}

/**
 * Recompute item fulfilment statuses and the request status after any fulfilment event
 * (reservation, release, assignment, issue, acknowledgement).
 */
export async function recomputeFulfilment(tx: Tx, requestId: number, actorId: number) {
  const request = await loadHeader(tx, requestId);
  if (!request) throw notFound("Request");
  const items = await loadItemStates(tx, requestId);

  for (const item of items) {
    const next = itemFulfilmentStatus(item.state);
    if (next !== item.fulfilmentStatus) {
      await execute(tx, `UPDATE dbo.hardware_request_items SET fulfilment_status = @next WHERE id = @id`, { id: item.id, next });
    }
  }

  const next = deriveRequestStatus(request.status as RequestStatus, items.map((i) => i.state));
  if (next !== request.status && canTransition(REQUEST_TRANSITIONS, request.status as RequestStatus, next)) {
    await setStatus(tx, requestId, next);
    await recordHistory(tx, { hardwareRequestId: requestId, actorUserId: actorId, action: next });
  }
  return next;
}

/**
 * IT technical review: confirm specification, reserve stock per warehouse, and mark
 * any shortfall for procurement. Supports partial fulfilment and repeated reviews.
 */
export async function saveItReview(user: AuthUser, id: number, input: ItReviewInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const request = await loadHeader(tx, id);
    if (!request) throw notFound("Request");
    if (!IT_REVIEWABLE.includes(request.status as RequestStatus)) {
      throw conflict(`Requests in "${request.status}" status are not ready for IT review`);
    }
    const items = await query<{
      id: number;
      categoryId: number;
      procurementQuantity: number;
      requestedSpecification: string;
      approvedSpecification: string | null;
      itReviewComments: string | null;
      isSerialized: boolean;
    }>(
      tx,
      `SELECT i.id, i.category_id AS categoryId, i.procurement_quantity AS procurementQuantity,
              i.requested_specification AS requestedSpecification, i.approved_specification AS approvedSpecification,
              i.it_review_comments AS itReviewComments, c.is_serialized AS isSerialized
       FROM dbo.hardware_request_items i JOIN dbo.hardware_categories c ON c.id = i.category_id
       WHERE i.hardware_request_id = @id`,
      { id }
    );
    if (request.status === REQUEST_STATUS.APPROVED) {
      await setStatus(tx, id, transition(request.status, REQUEST_STATUS.UNDER_IT_REVIEW));
    }

    const states = new Map((await loadItemStates(tx, id)).map((s) => [s.id, s.state]));

    for (const line of input.items) {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) throw new AppError("VALIDATION_ERROR", `Item ${line.itemId} does not belong to this request`);
      const state = states.get(item.id)!;
      const reserveTotal = line.reserve.reduce((s, r) => s + r.quantity, 0);
      const extraProcure = Math.max(0, line.procureQuantity - item.procurementQuantity);
      if (reserveTotal + extraProcure > remainingToPlan(state)) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Item ${item.id}: reserving ${reserveTotal} and procuring ${extraProcure} more exceeds the ${remainingToPlan(state)} unit(s) still unplanned`
        );
      }
      if (line.procureQuantity < item.procurementQuantity) {
        throw new AppError("VALIDATION_ERROR", `Item ${item.id}: procurement quantity cannot be reduced here`);
      }

      for (const r of line.reserve) {
        await reserveForItem(
          tx,
          user,
          { id: item.id, categoryId: item.categoryId, isSerialized: item.isSerialized },
          r.warehouseId,
          r.quantity,
          correlationId
        );
      }

      await execute(
        tx,
        `UPDATE dbo.hardware_request_items
         SET approved_specification = @approvedSpecification, it_review_comments = @itReviewComments,
             procurement_quantity = @procurementQuantity, reviewed_by_user_id = @reviewedByUserId, reviewed_at = SYSUTCDATETIME()
         WHERE id = @id`,
        {
          id: item.id,
          approvedSpecification: line.approvedSpecification ?? item.approvedSpecification ?? item.requestedSpecification,
          itReviewComments: line.comments ?? item.itReviewComments,
          procurementQuantity: line.procureQuantity,
          reviewedByUserId: user.id,
        }
      );
    }

    await recordHistory(tx, { hardwareRequestId: id, actorUserId: user.id, action: "IT Reviewed" });
    const status = await recomputeFulfilment(tx, id, user.id);

    const reservedAny = input.items.some((l) => l.reserve.length > 0);
    if (reservedAny) {
      await notify(tx, {
        recipientUserId: request.requesterUserId,
        eventType: NOTIFICATION_EVENT.STOCK_RESERVED,
        title: `Assets reserved for ${request.requestNumber}`,
        body: "IT has reserved stock for your request and will arrange handover.",
        link: `/requests/${id}`,
      });
    }
    await audit(tx, {
      actorUserId: user.id,
      action: "request.it_review",
      entityType: "hardware_request",
      entityId: id,
      before: { status: request.status },
      after: { status, items: input.items },
      correlationId,
    });
    return { id, status };
  });
}

/**
 * Called after IT issues reserved quantity-tracked stock: ask the requester to confirm receipt.
 * The request stays Partially Fulfilled until they do (see acknowledgeIssuedStock).
 */
export async function notifyStockIssued(tx: Tx, requestItemId: number, quantity: number) {
  const row = await queryOne<{ requestId: number; requestNumber: string; requesterUserId: number }>(
    tx,
    `SELECT r.id AS requestId, r.request_number AS requestNumber, r.requester_user_id AS requesterUserId
     FROM dbo.hardware_request_items i JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
     WHERE i.id = @id`,
    { id: requestItemId }
  );
  if (!row) throw notFound("Request item");
  await notify(tx, {
    recipientUserId: row.requesterUserId,
    eventType: NOTIFICATION_EVENT.ASSET_ACK_PENDING,
    title: `Please acknowledge items for ${row.requestNumber}`,
    body: `IT has issued ${quantity} unit(s) to you. Confirm you have received them.`,
    link: `/requests/${row.requestId}`,
  });
  return row.requestId;
}

/** The requester confirms receipt of issued quantity-tracked stock. Only the requester can acknowledge. */
export async function acknowledgeIssuedStock(user: AuthUser, reservationId: number, correlationId?: string) {
  return withTransaction(async (tx) => {
    const res = await queryOne<{
      id: number;
      status: string;
      assetId: number | null;
      acknowledgedAt: Date | null;
      requestId: number;
      requesterUserId: number;
    }>(
      tx,
      `SELECT res.id, res.status, res.asset_id AS assetId, res.acknowledged_at AS acknowledgedAt,
              r.id AS requestId, r.requester_user_id AS requesterUserId
       FROM dbo.inventory_reservations res
       JOIN dbo.hardware_request_items i ON i.id = res.request_item_id
       JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
       WHERE res.id = @id`,
      { id: reservationId }
    );
    if (!res) throw notFound("Issued stock");
    if (res.requesterUserId !== user.id) throw forbidden("Only the employee who received the items can acknowledge them");
    if (res.assetId) throw new AppError("VALIDATION_ERROR", "Serialized assets are acknowledged on the asset assignment");
    if (res.status !== RESERVATION_STATUS.CONSUMED) throw conflict("These items have not been issued yet");
    const count = await execute(
      tx,
      `UPDATE dbo.inventory_reservations SET acknowledged_at = SYSUTCDATETIME() WHERE id = @id AND acknowledged_at IS NULL`,
      { id: res.id }
    );
    if (count !== 1) throw conflict("Already acknowledged");
    await recordHistory(tx, { hardwareRequestId: res.requestId, actorUserId: user.id, action: "Receipt acknowledged" });
    const status = await recomputeFulfilment(tx, res.requestId, user.id);
    await audit(tx, {
      actorUserId: user.id,
      action: "inventory.issue.acknowledge",
      entityType: "inventory_reservation",
      entityId: res.id,
      after: { requestStatus: status },
      correlationId,
    });
    return { id: res.id, requestStatus: status };
  });
}

