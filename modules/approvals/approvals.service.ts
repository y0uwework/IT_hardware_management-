import { execute, getPool, likeContains, query, queryMany, queryOne, type Tx, Where, withTransaction } from "../../shared/db";
import { AppError, conflict, forbidden, invalidTransition, notFound } from "../../shared/errors";
import type { AuthUser } from "../../shared/auth";
import { APPROVAL_STATUS, canTransition, REQUEST_STATUS, REQUEST_TRANSITIONS, type RequestStatus } from "../../shared/config/status.config";
import { appConfig } from "../../shared/config/app.config";
import { audit } from "../../shared/audit";
import { historyCols, itemCols, requestCols, taskCols } from "../../shared/sql-columns";
import { NOTIFICATION_EVENT, notify } from "../notifications/notifications.service";
import { estimateRequestAmount, isStageGroupComplete, nextStageOrder, selectWorkflow } from "./approvals.rules";
import type { Pagination } from "../../shared/validation";
import { skipTake } from "../../shared/validation";
import { APPROVER_TYPE } from "./approvals.types";
import type { ApprovalAction } from "./approvals.types";

interface Stage {
  id: number;
  workflowId: number;
  stageOrder: number;
  name: string;
  approverType: string;
  roleKey: string | null;
  dueDays: number;
}

const STAGE_SELECT = `s.id, s.workflow_id AS workflowId, s.stage_order AS stageOrder, s.name,
  s.approver_type AS approverType, s.role_key AS roleKey, s.due_days AS dueDays`;

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

/** Append an entry to a request's approval history. */
export async function recordHistory(
  tx: Tx,
  h: {
    hardwareRequestId: number;
    actorUserId: number;
    action: string;
    taskId?: number | null;
    stageName?: string | null;
    workflowVersion?: number | null;
    comments?: string | null;
  }
) {
  await execute(
    tx,
    `INSERT INTO dbo.approval_history (hardware_request_id, task_id, stage_name, workflow_version, actor_user_id, [action], comments)
     VALUES (@hardwareRequestId, @taskId, @stageName, @workflowVersion, @actorUserId, @action, @comments)`,
    {
      hardwareRequestId: h.hardwareRequestId,
      taskId: h.taskId ?? null,
      stageName: h.stageName ?? null,
      workflowVersion: h.workflowVersion ?? null,
      actorUserId: h.actorUserId,
      action: h.action,
      comments: h.comments ?? null,
    }
  );
}

/**
 * Resolve approver user IDs for a stage. The requester never approves their own request,
 * except as the last-resort Administrator fallback (see below).
 */
async function resolveApprovers(
  tx: Tx,
  stage: { name: string; approverType: string; roleKey: string | null },
  requester: { id: number; managerId: number | null }
): Promise<number[]> {
  let ids: number[] = [];
  if (stage.approverType === APPROVER_TYPE.MANAGER) {
    if (requester.managerId) {
      const mgr = await queryOne<{ id: number }>(tx, `SELECT id FROM dbo.users WHERE id = @id AND is_active = 1`, {
        id: requester.managerId,
      });
      if (mgr) ids = [mgr.id];
    }
  } else if (stage.approverType === APPROVER_TYPE.ROLE && stage.roleKey) {
    const holders = await query<{ id: number }>(tx, `SELECT id FROM dbo.users WHERE role = @role AND is_active = 1`, {
      role: stage.roleKey,
    });
    ids = holders.map((h) => h.id);
  }
  ids = ids.filter((id) => id !== requester.id);
  if (ids.length === 0) {
    // Fallback: no manager assigned (or no other role holder) → route to active Administrators.
    // An Administrator may action their own request only when no other Administrator exists,
    // so a single admin account can exercise the full flow end to end.
    const admins = await query<{ id: number }>(tx, `SELECT id FROM dbo.users WHERE role = @role AND is_active = 1`, {
      role: "ADMINISTRATOR",
    });
    const others = admins.map((a) => a.id).filter((id) => id !== requester.id);
    ids = others.length > 0 ? others : admins.map((a) => a.id);
  }
  if (ids.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `No eligible approver could be found for the "${stage.name}" stage. Contact your administrator.`
    );
  }
  return ids;
}

async function createTasksForStageGroup(
  tx: Tx,
  request: { id: number; requestNumber: string; requester: { id: number; managerId: number | null; fullName: string } },
  stages: Stage[],
  cycle: number
) {
  for (const stage of stages) {
    const approverIds = await resolveApprovers(tx, stage, request.requester);
    for (const approverUserId of approverIds) {
      const task = (await queryOne<{ id: number }>(
        tx,
        `INSERT INTO dbo.approval_tasks (hardware_request_id, stage_id, approver_user_id, cycle, status, due_at)
         OUTPUT INSERTED.id
         VALUES (@hardwareRequestId, @stageId, @approverUserId, @cycle, @status, @dueAt)`,
        {
          hardwareRequestId: request.id,
          stageId: stage.id,
          approverUserId,
          cycle,
          status: APPROVAL_STATUS.PENDING,
          dueAt: addDays(stage.dueDays || appConfig.approvalDueDays),
        }
      ))!;
      await notify(tx, {
        recipientUserId: approverUserId,
        eventType: NOTIFICATION_EVENT.APPROVAL_PENDING,
        title: `Approval needed: ${request.requestNumber}`,
        body: `${request.requester.fullName}'s hardware request is waiting for your ${stage.name} approval.`,
        link: `/approvals/${task.id}`,
      });
    }
  }
}

function setRequestStatus(from: string, to: RequestStatus) {
  if (!canTransition(REQUEST_TRANSITIONS, from as RequestStatus, to)) throw invalidTransition(from, to);
  return to;
}

async function updateRequest(tx: Tx, id: number, set: { status?: string; workflowId?: number }) {
  await execute(
    tx,
    `UPDATE dbo.hardware_requests
     SET status = COALESCE(@status, status), workflow_id = COALESCE(@workflowId, workflow_id), updated_at = SYSUTCDATETIME()
     WHERE id = @id`,
    { id, status: set.status ?? null, workflowId: set.workflowId ?? null }
  );
}

/**
 * Called inside the submit transaction. Selects the configured workflow, records the
 * version used, and opens the first stage group. A workflow with no stages auto-approves.
 */
export async function startApproval(tx: Tx, requestId: number, actor: AuthUser) {
  const [[request], items, workflowRows, stageRows, [last]] = await queryMany(
    tx,
    `SELECT r.id, r.request_number AS requestNumber, r.request_type AS requestType,
            u.id AS [requester.id], u.manager_id AS [requester.managerId], u.full_name AS [requester.fullName],
            u.department AS [requester.department]
     FROM dbo.hardware_requests r JOIN dbo.users u ON u.id = r.requester_user_id
     WHERE r.id = @requestId;

     SELECT quantity, estimated_unit_price AS estimatedUnitPrice FROM dbo.hardware_request_items WHERE hardware_request_id = @requestId;

     SELECT id, workflow_key AS workflowKey, version, request_type AS requestType, department,
            min_amount AS minAmount, max_amount AS maxAmount, priority, is_active AS isActive
     FROM dbo.approval_workflows WHERE is_active = 1;

     SELECT ${STAGE_SELECT} FROM dbo.approval_workflow_stages s
     JOIN dbo.approval_workflows w ON w.id = s.workflow_id AND w.is_active = 1
     ORDER BY s.stage_order, s.id;

     SELECT MAX(cycle) AS maxCycle FROM dbo.approval_tasks WHERE hardware_request_id = @requestId;`,
    { requestId }
  );
  if (!request) throw notFound("Request");

  const amount = estimateRequestAmount(
    items.map((i) => ({ quantity: i.quantity, estimatedUnitPrice: i.estimatedUnitPrice === null ? null : Number(i.estimatedUnitPrice) }))
  );
  const workflows = workflowRows.map((w) => ({
    ...(w as { id: number; workflowKey: string; version: number; requestType: string | null; department: string | null; priority: number; isActive: boolean }),
    minAmount: w.minAmount === null ? null : Number(w.minAmount),
    maxAmount: w.maxAmount === null ? null : Number(w.maxAmount),
    stages: stageRows.filter((s) => s.workflowId === w.id) as Stage[],
  }));
  const workflow = selectWorkflow(workflows, {
    requestType: request.requestType,
    department: request.requester.department,
    amount,
  });
  if (!workflow) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No approval workflow is configured for this request type. Contact your administrator."
    );
  }

  const cycle = (last?.maxCycle ?? 0) + 1;

  const first = nextStageOrder(workflow.stages, null);
  if (first === null) {
    await updateRequest(tx, request.id, { workflowId: workflow.id, status: REQUEST_STATUS.APPROVED });
    await recordHistory(tx, {
      hardwareRequestId: request.id,
      actorUserId: actor.id,
      action: "Auto-approved",
      workflowVersion: workflow.version,
      comments: "Workflow has no approval stages",
    });
    return;
  }

  await updateRequest(tx, request.id, { workflowId: workflow.id });
  await createTasksForStageGroup(
    tx,
    { id: request.id, requestNumber: request.requestNumber, requester: request.requester },
    workflow.stages.filter((s) => s.stageOrder === first),
    cycle
  );
}

/** Close any open tasks for a request (used on reject / return / cancel). */
export async function skipOpenTasks(tx: Tx, requestId: number) {
  await execute(
    tx,
    `UPDATE dbo.approval_tasks SET status = @skipped, acted_at = SYSUTCDATETIME()
     WHERE hardware_request_id = @requestId AND status = @pending`,
    { requestId, skipped: APPROVAL_STATUS.SKIPPED, pending: APPROVAL_STATUS.PENDING }
  );
}

export async function listMyTasks(user: AuthUser, p: Pagination & { status?: string }) {
  const where = new Where().add("t.approver_user_id = @userId", { userId: user.id });
  if (p.status) where.add("t.status = @status", { status: p.status });
  if (p.search) where.add("(r.request_number LIKE @search OR u.full_name LIKE @search)", { search: likeContains(p.search) });
  const from = `FROM dbo.approval_tasks t
    JOIN dbo.approval_workflow_stages s ON s.id = t.stage_id
    JOIN dbo.hardware_requests r ON r.id = t.hardware_request_id
    JOIN dbo.users u ON u.id = r.requester_user_id
    ${where}`;
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT ${taskCols("t")}, s.name AS [stage.name],
              r.id AS [request.id], r.request_number AS [request.requestNumber], r.request_type AS [request.requestType],
              r.priority AS [request.priority], r.status AS [request.status], r.submitted_at AS [request.submittedAt],
              u.full_name AS [request.requester.fullName], u.department AS [request.requester.department],
              (SELECT COUNT(*) FROM dbo.hardware_request_items i WHERE i.hardware_request_id = r.id) AS [request._count.items]
       ${from}
       ORDER BY t.status DESC, t.created_at DESC, t.id DESC
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(p) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total ${from}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}

export async function getTask(user: AuthUser, taskId: number) {
  const pool = await getPool();
  const task = await queryOne(
    pool,
    `SELECT ${taskCols("t")},
            s.name AS [stage.name], s.stage_order AS [stage.stageOrder],
            w.name AS [stage.workflow.name], w.version AS [stage.workflow.version]
     FROM dbo.approval_tasks t
     JOIN dbo.approval_workflow_stages s ON s.id = t.stage_id
     JOIN dbo.approval_workflows w ON w.id = s.workflow_id
     WHERE t.id = @taskId`,
    { taskId }
  );
  if (!task) throw notFound("Approval task");
  if (task.approverUserId !== user.id) throw forbidden("This approval task is not assigned to you");

  const [[request], items, history] = await queryMany(
    pool,
    `SELECT ${requestCols("r")},
            u.id AS [requester.id], u.full_name AS [requester.fullName], u.employee_code AS [requester.employeeCode],
            u.department AS [requester.department], u.designation AS [requester.designation]
     FROM dbo.hardware_requests r JOIN dbo.users u ON u.id = r.requester_user_id
     WHERE r.id = @requestId;

     SELECT ${itemCols("i")}, c.name AS [category.name], im.item_code AS [item.code], im.item_name AS [item.name]
     FROM dbo.hardware_request_items i JOIN dbo.hardware_categories c ON c.id = i.category_id
     LEFT JOIN dbo.item_master im ON im.id = i.item_id
     WHERE i.hardware_request_id = @requestId ORDER BY i.id;

     SELECT ${historyCols("h")}, u.full_name AS [actor.fullName]
     FROM dbo.approval_history h JOIN dbo.users u ON u.id = h.actor_user_id
     WHERE h.hardware_request_id = @requestId ORDER BY h.created_at, h.id;`,
    { requestId: task.hardwareRequestId }
  );
  return { ...task, request: { ...request, items, history } };
}

/**
 * Approve / reject / return. Only the assigned approver may act, only once.
 * The conditional update makes double-submits and races safe.
 */
export async function actOnTask(
  user: AuthUser,
  taskId: number,
  action: ApprovalAction,
  comments: string | undefined,
  correlationId?: string
) {
  if ((action === "reject" || action === "return") && !comments?.trim()) {
    throw new AppError("VALIDATION_ERROR", "Please add a comment explaining your decision", [
      { path: "comments", message: "A comment is required" },
    ]);
  }

  return withTransaction(async (tx) => {
    const task = await queryOne(
      tx,
      `SELECT t.id, t.stage_id AS stageId, t.approver_user_id AS approverUserId, t.cycle, t.status,
              s.name AS [stage.name], s.stage_order AS [stage.stageOrder], s.workflow_id AS [stage.workflowId],
              w.version AS [stage.workflowVersion],
              r.id AS [request.id], r.request_number AS [request.requestNumber], r.status AS [request.status],
              r.requester_user_id AS [request.requesterUserId],
              u.id AS [request.requester.id], u.manager_id AS [request.requester.managerId],
              u.full_name AS [request.requester.fullName]
       FROM dbo.approval_tasks t
       JOIN dbo.approval_workflow_stages s ON s.id = t.stage_id
       JOIN dbo.approval_workflows w ON w.id = s.workflow_id
       JOIN dbo.hardware_requests r ON r.id = t.hardware_request_id
       JOIN dbo.users u ON u.id = r.requester_user_id
       WHERE t.id = @taskId`,
      { taskId }
    );
    if (!task) throw notFound("Approval task");
    if (task.approverUserId !== user.id) throw forbidden("This approval task is not assigned to you");
    if (task.status !== APPROVAL_STATUS.PENDING) throw conflict(`This task has already been ${String(task.status).toLowerCase()}`);
    if (task.request.status !== REQUEST_STATUS.PENDING_APPROVAL) {
      throw conflict(`The request is no longer pending approval (current status: ${task.request.status})`);
    }

    const newTaskStatus =
      action === "approve" ? APPROVAL_STATUS.APPROVED : action === "reject" ? APPROVAL_STATUS.REJECTED : APPROVAL_STATUS.RETURNED;

    const updated = await execute(
      tx,
      `UPDATE dbo.approval_tasks SET status = @newStatus, acted_at = SYSUTCDATETIME(), comments = @comments
       WHERE id = @id AND status = @pending`,
      { id: task.id, newStatus: newTaskStatus, comments: comments?.trim() || null, pending: APPROVAL_STATUS.PENDING }
    );
    if (updated !== 1) throw conflict("This task was already actioned");

    const request = task.request as {
      id: number;
      requestNumber: string;
      status: string;
      requesterUserId: number;
      requester: { id: number; managerId: number | null; fullName: string };
    };

    await recordHistory(tx, {
      hardwareRequestId: request.id,
      taskId: task.id,
      stageName: task.stage.name,
      workflowVersion: task.stage.workflowVersion,
      actorUserId: user.id,
      action: newTaskStatus,
      comments: comments?.trim() || null,
    });

    let requestStatus: string = request.status;

    if (action === "reject" || action === "return") {
      requestStatus = setRequestStatus(
        request.status,
        action === "reject" ? REQUEST_STATUS.REJECTED : REQUEST_STATUS.RETURNED
      );
      await skipOpenTasks(tx, request.id);
      await updateRequest(tx, request.id, { status: requestStatus });
      await notify(tx, {
        recipientUserId: request.requesterUserId,
        eventType: action === "reject" ? NOTIFICATION_EVENT.REQUEST_REJECTED : NOTIFICATION_EVENT.REQUEST_RETURNED,
        title: `${request.requestNumber} ${action === "reject" ? "was rejected" : "needs changes"}`,
        body: comments?.trim(),
        link: `/requests/${request.id}`,
      });
    } else {
      // A ROLE stage is satisfied by any one holder: close the sibling tasks.
      await execute(
        tx,
        `UPDATE dbo.approval_tasks SET status = @skipped, acted_at = SYSUTCDATETIME()
         WHERE hardware_request_id = @requestId AND stage_id = @stageId AND cycle = @cycle AND status = @pending`,
        {
          requestId: request.id,
          stageId: task.stageId,
          cycle: task.cycle,
          skipped: APPROVAL_STATUS.SKIPPED,
          pending: APPROVAL_STATUS.PENDING,
        }
      );

      const stages = await query<Stage>(
        tx,
        `SELECT ${STAGE_SELECT} FROM dbo.approval_workflow_stages s WHERE s.workflow_id = @workflowId ORDER BY s.stage_order, s.id`,
        { workflowId: task.stage.workflowId }
      );
      const groupStageIds = stages.filter((s) => s.stageOrder === task.stage.stageOrder).map((s) => s.id);
      const cycleTasks = await query<{ stageId: number; status: string }>(
        tx,
        `SELECT stage_id AS stageId, status FROM dbo.approval_tasks WHERE hardware_request_id = @requestId AND cycle = @cycle`,
        { requestId: request.id, cycle: task.cycle }
      );

      if (isStageGroupComplete(groupStageIds, cycleTasks)) {
        const next = nextStageOrder(stages, task.stage.stageOrder);
        if (next !== null) {
          await createTasksForStageGroup(
            tx,
            request,
            stages.filter((s) => s.stageOrder === next),
            task.cycle
          );
        } else {
          requestStatus = setRequestStatus(request.status, REQUEST_STATUS.APPROVED);
          await updateRequest(tx, request.id, { status: requestStatus });
          await notify(tx, {
            recipientUserId: request.requesterUserId,
            eventType: NOTIFICATION_EVENT.REQUEST_APPROVED,
            title: `${request.requestNumber} was approved`,
            body: "IT will now review your request and check stock.",
            link: `/requests/${request.id}`,
          });
        }
      }
    }

    await audit(tx, {
      actorUserId: user.id,
      action: `approval.${action}`,
      entityType: "hardware_request",
      entityId: request.id,
      before: { status: request.status, taskStatus: APPROVAL_STATUS.PENDING },
      after: { status: requestStatus, taskStatus: newTaskStatus, taskId: task.id },
      correlationId,
    });

    return { taskId: task.id as number, taskStatus: newTaskStatus, requestStatus };
  });
}
