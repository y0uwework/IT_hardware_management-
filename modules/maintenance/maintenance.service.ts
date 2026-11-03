// Maintenance tickets: report â†’ assign â†’ work (diagnosis, repair, parts) â†’ resolve â†’ close.
// Reporters see their own tickets and can confirm (close) or reopen them; technicians
// (maintenance.manage) see everything.

import { execute, getPool, likeContains, query, queryMany, queryOne, type Tx, Where, withTransaction } from "../../shared/db";
import { AppError, conflict, forbidden, notFound } from "../../shared/errors";
import type { AuthUser } from "../../shared/auth";
import { appConfig } from "../../shared/config/app.config";
import { ASSET_STATUS, canTransition, MAINTENANCE_STATUS, MAINTENANCE_TRANSITIONS, type MaintenanceStatus, MOVEMENT_TYPE } from "../../shared/config/status.config";
import { audit } from "../../shared/audit";
import { assignNumber, tmpNumber } from "../../shared/numbering";
import { skipTake } from "../../shared/validation";
import { userHas } from "../../middlewares/authorize";
import { moveStock, recordMovementRow } from "../inventory/inventory.service";
import { notify } from "../notifications/notifications.service";
import { slaDueAt } from "./maintenance.rules";
import type { TicketCreateInput, TicketListQuery } from "./maintenance.types";

const OPEN_STATES = [MAINTENANCE_STATUS.OPEN, MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.WAITING_FOR_PARTS];

const COUNTER_FOR: Record<string, "quantityAvailable" | "quantityUnderRepair" | "quantityDamaged" | null> = {
  [ASSET_STATUS.AVAILABLE]: "quantityAvailable",
  [ASSET_STATUS.UNDER_MAINTENANCE]: "quantityUnderRepair",
  [ASSET_STATUS.DAMAGED]: "quantityDamaged",
  [ASSET_STATUS.RETIRED]: null,
};

const TICKET_COLS = `t.id, t.ticket_number AS ticketNumber, t.title, t.description, t.issue_category AS issueCategory, t.priority,
  t.severity, t.status, t.sla_due_at AS slaDueAt, t.assigned_at AS assignedAt, t.diagnosis, t.resolution_notes AS resolutionNotes,
  t.resolved_at AS resolvedAt, t.closed_at AS closedAt, t.is_repeat AS isRepeat, t.asset_taken_in AS assetTakenIn,
  t.created_at AS createdAt, t.updated_at AS updatedAt, t.reported_by_user_id AS reportedByUserId,
  CAST(CASE WHEN COALESCE(t.resolved_at, SYSUTCDATETIME()) > t.sla_due_at THEN 1 ELSE 0 END AS BIT) AS slaBreached,
  rb.full_name AS [reportedBy.fullName], rb.department AS [reportedBy.department],
  tech.id AS [assignedTo.id], tech.full_name AS [assignedTo.fullName],
  a.id AS [asset.id], a.asset_tag AS [asset.assetTag], a.model AS [asset.model], a.status AS [asset.status]`;
const TICKET_FROM = `FROM dbo.maintenance_tickets t
  JOIN dbo.users rb ON rb.id = t.reported_by_user_id
  LEFT JOIN dbo.users tech ON tech.id = t.assigned_to_user_id
  LEFT JOIN dbo.assets a ON a.id = t.asset_id`;

export async function listTickets(user: AuthUser, q: TicketListQuery) {
  const manage = userHas(user, "maintenance.manage");
  const scope = manage ? q.scope : "mine";
  const where = new Where();
  if (scope === "mine") where.add("t.reported_by_user_id = @me", { me: user.id });
  if (scope === "assigned") where.add("t.assigned_to_user_id = @me", { me: user.id });
  if (q.status) where.add("t.status = @status", { status: q.status });
  if (q.overdue) where.add("t.status IN (@open) AND t.sla_due_at < SYSUTCDATETIME()", { open: OPEN_STATES });
  if (q.search) where.add("(t.ticket_number LIKE @s OR t.title LIKE @s OR a.asset_tag LIKE @s OR rb.full_name LIKE @s)", { s: likeContains(q.search) });
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(pool, `SELECT ${TICKET_COLS} ${TICKET_FROM} ${where} ORDER BY t.created_at DESC, t.id DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, {
      ...where.params,
      ...skipTake(q),
    }),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${TICKET_FROM} ${where}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

async function loadTicket(tx: Tx, ticketId: number, lock = false) {
  const t = await queryOne<{
    id: number;
    ticketNumber: string;
    status: MaintenanceStatus;
    reportedByUserId: number;
    assignedToUserId: number | null;
    assetId: number | null;
    assetTakenIn: boolean;
    assetStatusBefore: string | null;
  }>(
    tx,
    `SELECT id, ticket_number AS ticketNumber, status, reported_by_user_id AS reportedByUserId, assigned_to_user_id AS assignedToUserId,
            asset_id AS assetId, asset_taken_in AS assetTakenIn, asset_status_before AS assetStatusBefore
     FROM dbo.maintenance_tickets ${lock ? "WITH (UPDLOCK, HOLDLOCK)" : ""} WHERE id = @id`,
    { id: ticketId }
  );
  if (!t) throw notFound("Ticket");
  return t;
}

function assertCanSee(user: AuthUser, t: { reportedByUserId: number }) {
  if (t.reportedByUserId !== user.id && !userHas(user, "maintenance.manage")) throw notFound("Ticket");
}

export async function getTicket(user: AuthUser, ticketId: number) {
  const pool = await getPool();
  const [[header], activities, parts, history] = await queryMany(
    pool,
    `SELECT ${TICKET_COLS}, c.name AS [asset.categoryName], a.serial_number AS [asset.serialNumber]
     ${TICKET_FROM} LEFT JOIN dbo.hardware_categories c ON c.id = a.category_id WHERE t.id = @id;

     SELECT m.id, m.activity_type AS activityType, m.description, CONVERT(NVARCHAR(20), m.hours_spent) AS hoursSpent,
            m.created_at AS createdAt, u.full_name AS [actor.fullName]
     FROM dbo.maintenance_activities m JOIN dbo.users u ON u.id = m.actor_user_id WHERE m.ticket_id = @id ORDER BY m.created_at, m.id;

     SELECT p.id, p.part_name AS partName, p.quantity, CONVERT(NVARCHAR(40), p.unit_cost) AS unitCost,
            CONVERT(NVARCHAR(40), p.quantity * p.unit_cost) AS lineCost, v.name AS [vendor.name], im.item_code AS [item.code], p.created_at AS createdAt
     FROM dbo.maintenance_parts p LEFT JOIN dbo.vendors v ON v.id = p.vendor_id LEFT JOIN dbo.item_master im ON im.id = p.item_id
     WHERE p.ticket_id = @id ORDER BY p.id;

     SELECT t2.id, t2.ticket_number AS ticketNumber, t2.title, t2.status, t2.created_at AS createdAt
     FROM dbo.maintenance_tickets t2 JOIN dbo.maintenance_tickets t ON t.asset_id = t2.asset_id
     WHERE t.id = @id AND t2.id <> @id ORDER BY t2.created_at DESC;`,
    { id: ticketId }
  );
  if (!header) throw notFound("Ticket");
  assertCanSee(user, header as { reportedByUserId: number });
  const partsCost = parts.reduce((s, p) => s + Number(p.lineCost), 0);
  const hours = activities.reduce((s, a) => s + (a.hoursSpent ? Number(a.hoursSpent) : 0), 0);
  return { ...header, activities, parts, partsCost: partsCost.toFixed(2), hoursSpent: hours, assetHistory: history };
}

export async function listTechnicians() {
  return query(
    await getPool(),
    `SELECT u.id, u.full_name AS fullName, u.employee_code AS employeeCode,
            (SELECT COUNT(*) FROM dbo.maintenance_tickets t WHERE t.assigned_to_user_id = u.id AND t.status IN (@open)) AS openTickets
     FROM dbo.users u
     WHERE u.is_active = 1 AND EXISTS (
       SELECT 1 FROM OPENJSON(u.permissions) j JOIN dbo.permissions p ON p.id = TRY_CAST(j.value AS INT)
       WHERE p.permission_key = N'maintenance.manage')
     ORDER BY u.full_name`,
    { open: OPEN_STATES }
  );
}

async function addActivity(tx: Tx, ticketId: number, actorId: number, type: string, description: string | null, hours: number | null = null) {
  await execute(
    tx,
    `INSERT INTO dbo.maintenance_activities (ticket_id, actor_user_id, activity_type, description, hours_spent)
     VALUES (@ticketId, @actorId, @type, @description, @hours)`,
    { ticketId, actorId, type, description, hours }
  );
}

function move(from: MaintenanceStatus, to: MaintenanceStatus) {
  if (!canTransition(MAINTENANCE_TRANSITIONS, from, to)) throw conflict(`A ticket in "${from}" cannot move to "${to}"`);
}

export async function createTicket(user: AuthUser, input: TicketCreateInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    let isRepeat = false;
    if (input.assetId) {
      const asset = await queryOne<{ id: number }>(tx, `SELECT id FROM dbo.assets WHERE id = @id`, { id: input.assetId });
      if (!asset) throw new AppError("VALIDATION_ERROR", "Asset not found", [{ path: "assetId", message: "Choose an asset" }]);
      if (!userHas(user, "maintenance.manage")) {
        const mine = await queryOne(tx, `SELECT 1 AS x FROM dbo.asset_assignments WHERE asset_id = @a AND user_id = @u AND is_active = 1`, {
          a: input.assetId,
          u: user.id,
        });
        if (!mine) throw forbidden("You can only report issues for assets issued to you");
      }
      const prior = await queryOne<{ n: number }>(
        tx,
        `SELECT COUNT(*) AS n FROM dbo.maintenance_tickets WHERE asset_id = @a AND created_at >= DATEADD(DAY, -@days, SYSUTCDATETIME())`,
        { a: input.assetId, days: appConfig.repeatIssueWindowDays }
      );
      isRepeat = (prior?.n ?? 0) > 0;
    }
    const row = (await queryOne<{ id: number }>(
      tx,
      `INSERT INTO dbo.maintenance_tickets (ticket_number, asset_id, reported_by_user_id, title, description, issue_category, priority,
         severity, status, sla_due_at, is_repeat)
       OUTPUT INSERTED.id
       VALUES (@tmp, @assetId, @me, @title, @description, @issueCategory, @priority, @severity, @status, @due, @isRepeat)`,
      { tmp: tmpNumber(), ...input, me: user.id, status: MAINTENANCE_STATUS.OPEN, due: slaDueAt(input.priority), isRepeat }
    ))!;
    const ticketNumber = await assignNumber(tx, "maintenance_tickets", "ticket_number", appConfig.numberPrefixes.maintenance, row.id);
    await addActivity(tx, row.id, user.id, "Reported", input.description);
    await audit(tx, { actorUserId: user.id, action: "maintenance.create", entityType: "maintenance_ticket", entityId: row.id, after: { ticketNumber, ...input, isRepeat }, correlationId });
    return { id: row.id, ticketNumber, isRepeat };
  });
}

export async function assignTicket(actor: AuthUser, ticketId: number, assigneeUserId: number, comments: string | null, correlationId?: string) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId, true);
    const tech = (await listTechnicians()).find((u) => u.id === assigneeUserId);
    if (!tech) throw new AppError("VALIDATION_ERROR", "Choose an active technician", [{ path: "assigneeUserId", message: "Not a technician" }]);
    move(t.status, MAINTENANCE_STATUS.ASSIGNED);
    await execute(
      tx,
      `UPDATE dbo.maintenance_tickets SET status = @s, assigned_to_user_id = @to, assigned_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id`,
      { id: ticketId, s: MAINTENANCE_STATUS.ASSIGNED, to: assigneeUserId }
    );
    await addActivity(tx, ticketId, actor.id, "Assigned", `Assigned to ${tech.fullName}${comments ? ` â€” ${comments}` : ""}`);
    if (assigneeUserId !== actor.id) {
      await notify(tx, { recipientUserId: assigneeUserId, eventType: "maintenance.assigned", title: `${t.ticketNumber} assigned to you`, link: `/maintenance/${ticketId}` });
    }
    await notify(tx, { recipientUserId: t.reportedByUserId, eventType: "maintenance.assigned", title: `${t.ticketNumber}: technician assigned`, body: tech.fullName, link: `/maintenance/${ticketId}` });
    await audit(tx, { actorUserId: actor.id, action: "maintenance.assign", entityType: "maintenance_ticket", entityId: ticketId, before: { status: t.status, assignedTo: t.assignedToUserId }, after: { status: MAINTENANCE_STATUS.ASSIGNED, assignedTo: assigneeUserId }, correlationId });
    return { id: ticketId };
  });
}

/** Move an asset between stock states, keeping the inventory counters in step. */
async function moveAsset(tx: Tx, actor: AuthUser, assetId: number, to: string, reason: string, ticketId: number) {
  const a = await queryOne<{ status: string; categoryId: number; warehouseId: number | null }>(
    tx,
    `SELECT status, category_id AS categoryId, warehouse_id AS warehouseId FROM dbo.assets WITH (UPDLOCK) WHERE id = @id`,
    { id: assetId }
  );
  if (!a) throw notFound("Asset");
  if (!a.warehouseId) throw conflict("The asset has no warehouse; it can't be taken into the repair store");
  const from = COUNTER_FOR[a.status];
  if (from === undefined) throw conflict(`An asset that is "${a.status}" can't be taken in for repair`);
  await execute(tx, `UPDATE dbo.assets SET status = @to, updated_at = SYSUTCDATETIME() WHERE id = @id`, { id: assetId, to });
  const target = COUNTER_FOR[to] ?? null;
  await moveStock(tx, a.categoryId, a.warehouseId, 1, from, target);
  await recordMovementRow(tx, {
    categoryId: a.categoryId,
    warehouseId: a.warehouseId,
    assetId,
    movementType: MOVEMENT_TYPE.ADJUSTMENT,
    quantity: 1,
    reason,
    referenceType: "maintenance_ticket",
    referenceId: ticketId,
    actorId: actor.id,
  });
  return a.status;
}

export async function progressTicket(
  actor: AuthUser,
  ticketId: number,
  input: { status: MaintenanceStatus; comments: string | null; takeAssetIn: boolean },
  correlationId?: string
) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId, true);
    move(t.status, input.status);
    let before: string | null = t.assetStatusBefore;
    if (input.takeAssetIn && !t.assetTakenIn) {
      if (!t.assetId) throw new AppError("VALIDATION_ERROR", "This ticket has no asset to take in");
      const current = await queryOne<{ status: string }>(tx, `SELECT status FROM dbo.assets WHERE id = @id`, { id: t.assetId });
      if (current?.status !== ASSET_STATUS.AVAILABLE && current?.status !== ASSET_STATUS.DAMAGED) {
        throw conflict(`Only assets in store (Available or Damaged) can be taken in. This one is "${current?.status}" â€” process its return first.`);
      }
      before = await moveAsset(tx, actor, t.assetId, ASSET_STATUS.UNDER_MAINTENANCE, `Taken in for repair (${t.ticketNumber})`, ticketId);
    }
    await execute(
      tx,
      `UPDATE dbo.maintenance_tickets SET status = @s, asset_taken_in = @takenIn, asset_status_before = @before,
         assigned_to_user_id = COALESCE(assigned_to_user_id, @actor), assigned_at = COALESCE(assigned_at, SYSUTCDATETIME()),
         updated_at = SYSUTCDATETIME() WHERE id = @id`,
      { id: ticketId, s: input.status, takenIn: t.assetTakenIn || input.takeAssetIn, before, actor: actor.id }
    );
    await addActivity(tx, ticketId, actor.id, "Status", [input.status, input.takeAssetIn ? "asset taken in" : null, input.comments].filter(Boolean).join(" â€” "));
    await audit(tx, { actorUserId: actor.id, action: "maintenance.progress", entityType: "maintenance_ticket", entityId: ticketId, before: { status: t.status }, after: input, correlationId });
    return { id: ticketId, status: input.status };
  });
}

export async function addTicketActivity(actor: AuthUser, ticketId: number, input: { activityType: string; description: string; hoursSpent: number | null }, correlationId?: string) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    if (t.status === MAINTENANCE_STATUS.CLOSED) throw conflict("The ticket is closed");
    await addActivity(tx, ticketId, actor.id, input.activityType, input.description, input.hoursSpent);
    if (input.activityType === "Diagnosis") {
      await execute(tx, `UPDATE dbo.maintenance_tickets SET diagnosis = @d, updated_at = SYSUTCDATETIME() WHERE id = @id`, { id: ticketId, d: input.description });
    }
    await audit(tx, { actorUserId: actor.id, action: "maintenance.activity", entityType: "maintenance_ticket", entityId: ticketId, after: input, correlationId });
    return { id: ticketId };
  });
}

export async function addTicketPart(
  actor: AuthUser,
  ticketId: number,
  input: { partName: string; itemId: number | null; quantity: number; unitCost: number; vendorId: number | null },
  correlationId?: string
) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    if (t.status === MAINTENANCE_STATUS.CLOSED) throw conflict("The ticket is closed");
    await execute(
      tx,
      `INSERT INTO dbo.maintenance_parts (ticket_id, item_id, part_name, quantity, unit_cost, vendor_id, created_by_user_id)
       VALUES (@ticketId, @itemId, @partName, @quantity, @unitCost, @vendorId, @actor)`,
      { ticketId, ...input, actor: actor.id }
    );
    await addActivity(tx, ticketId, actor.id, "Parts", `${input.quantity} Ã— ${input.partName} @ ${input.unitCost.toFixed(2)}`);
    await audit(tx, { actorUserId: actor.id, action: "maintenance.part", entityType: "maintenance_ticket", entityId: ticketId, after: input, correlationId });
    return { id: ticketId };
  });
}

export async function resolveTicket(actor: AuthUser, ticketId: number, input: { resolutionNotes: string; assetNextStatus: string }, correlationId?: string) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId, true);
    move(t.status, MAINTENANCE_STATUS.RESOLVED);
    if (t.assetTakenIn && t.assetId) {
      await moveAsset(tx, actor, t.assetId, input.assetNextStatus, `Released from repair (${t.ticketNumber})`, ticketId);
    }
    await execute(
      tx,
      `UPDATE dbo.maintenance_tickets SET status = @s, resolution_notes = @notes, resolved_at = SYSUTCDATETIME(), asset_taken_in = 0,
         updated_at = SYSUTCDATETIME() WHERE id = @id`,
      { id: ticketId, s: MAINTENANCE_STATUS.RESOLVED, notes: input.resolutionNotes }
    );
    await addActivity(tx, ticketId, actor.id, "Resolved", input.resolutionNotes + (t.assetTakenIn ? ` (asset â†’ ${input.assetNextStatus})` : ""));
    await notify(tx, {
      recipientUserId: t.reportedByUserId,
      eventType: "maintenance.resolved",
      title: `${t.ticketNumber} resolved`,
      body: "Please confirm the fix or reopen the ticket.",
      link: `/maintenance/${ticketId}`,
    });
    await audit(tx, { actorUserId: actor.id, action: "maintenance.resolve", entityType: "maintenance_ticket", entityId: ticketId, before: { status: t.status }, after: input, correlationId });
    return { id: ticketId, status: MAINTENANCE_STATUS.RESOLVED };
  });
}

/** Close: the reporter confirms the fix, or a technician closes it (also used to close an invalid Open ticket). */
export async function closeTicket(actor: AuthUser, ticketId: number, comments: string | null, correlationId?: string) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId, true);
    const isReporter = t.reportedByUserId === actor.id;
    if (!isReporter && !userHas(actor, "maintenance.manage")) throw forbidden();
    if (t.status === MAINTENANCE_STATUS.OPEN && !userHas(actor, "maintenance.manage") && !isReporter) throw forbidden();
    move(t.status, MAINTENANCE_STATUS.CLOSED);
    await execute(tx, `UPDATE dbo.maintenance_tickets SET status = @s, closed_at = SYSUTCDATETIME(), closed_by_user_id = @actor, updated_at = SYSUTCDATETIME() WHERE id = @id`, {
      id: ticketId,
      s: MAINTENANCE_STATUS.CLOSED,
      actor: actor.id,
    });
    await addActivity(tx, ticketId, actor.id, "Closed", comments ?? (isReporter ? "Confirmed fixed by reporter" : null));
    await audit(tx, { actorUserId: actor.id, action: "maintenance.close", entityType: "maintenance_ticket", entityId: ticketId, before: { status: t.status }, after: { comments }, correlationId });
    return { id: ticketId, status: MAINTENANCE_STATUS.CLOSED };
  });
}

export async function reopenTicket(actor: AuthUser, ticketId: number, reason: string, correlationId?: string) {
  return withTransaction(async (tx) => {
    const t = await loadTicket(tx, ticketId, true);
    if (t.reportedByUserId !== actor.id && !userHas(actor, "maintenance.manage")) throw forbidden();
    move(t.status, MAINTENANCE_STATUS.IN_PROGRESS);
    await execute(
      tx,
      `UPDATE dbo.maintenance_tickets SET status = @s, resolved_at = NULL, closed_at = NULL, closed_by_user_id = NULL, updated_at = SYSUTCDATETIME() WHERE id = @id`,
      { id: ticketId, s: MAINTENANCE_STATUS.IN_PROGRESS }
    );
    await addActivity(tx, ticketId, actor.id, "Reopened", reason);
    if (t.assignedToUserId && t.assignedToUserId !== actor.id) {
      await notify(tx, { recipientUserId: t.assignedToUserId, eventType: "maintenance.reopened", title: `${t.ticketNumber} reopened`, body: reason, link: `/maintenance/${ticketId}` });
    }
    await audit(tx, { actorUserId: actor.id, action: "maintenance.reopen", entityType: "maintenance_ticket", entityId: ticketId, before: { status: t.status }, after: { reason }, correlationId });
    return { id: ticketId, status: MAINTENANCE_STATUS.IN_PROGRESS };
  });
}
