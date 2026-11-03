import { prisma, type Tx } from "../../lib/prisma";
import { AppError, conflict, forbidden, invalidTransition, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import {
  APPROVAL_STATUS,
  REQUEST_STATUS,
  REQUEST_TRANSITIONS,
  canTransition,
  type RequestStatus,
} from "../../config/status.config";
import { appConfig } from "../../config/app.config";
import { audit } from "../utils/audit";
import { notify, NOTIFICATION_EVENT } from "./notification.service";
import {
  estimateRequestAmount,
  isStageGroupComplete,
  nextStageOrder,
  selectWorkflow,
} from "./workflow-rules";
import type { Pagination } from "../../lib/validation";
import { skipTake } from "../../lib/validation";

export const APPROVER_TYPE = { MANAGER: "MANAGER", ROLE: "ROLE" } as const;
export type ApprovalAction = "approve" | "reject" | "return";

const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

function addDays(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

/** Resolve approver user IDs for a stage. The requester can never approve their own request. */
async function resolveApprovers(
  tx: Tx,
  stage: { name: string; approverType: string; roleKey: string | null },
  requester: { id: number; managerId: number | null }
): Promise<number[]> {
  let ids: number[] = [];
  if (stage.approverType === APPROVER_TYPE.MANAGER) {
    if (requester.managerId) {
      const mgr = await tx.user.findFirst({
        where: { id: requester.managerId, isActive: true },
        select: { id: true },
      });
      if (mgr) ids = [mgr.id];
    }
  } else if (stage.approverType === APPROVER_TYPE.ROLE && stage.roleKey) {
    const holders = await tx.user.findMany({
      where: { role: stage.roleKey, isActive: true },
      select: { id: true },
    });
    ids = holders.map((h) => h.id);
  }
  ids = ids.filter((id) => id !== requester.id);
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
  stages: { id: number; name: string; approverType: string; roleKey: string | null; dueDays: number }[],
  cycle: number
) {
  for (const stage of stages) {
    const approverIds = await resolveApprovers(tx, stage, request.requester);
    for (const approverUserId of approverIds) {
      const task = await tx.approvalTask.create({
        data: {
          hardwareRequestId: request.id,
          stageId: stage.id,
          approverUserId,
          cycle,
          status: APPROVAL_STATUS.PENDING,
          dueAt: addDays(stage.dueDays || appConfig.approvalDueDays),
        },
      });
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

/**
 * Called inside the submit transaction. Selects the configured workflow, records the
 * version used, and opens the first stage group. A workflow with no stages auto-approves.
 */
export async function startApproval(tx: Tx, requestId: number, actor: AuthUser) {
  const request = await tx.hardwareRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: {
      items: { select: { quantity: true, estimatedUnitPrice: true } },
      requester: { select: { id: true, managerId: true, fullName: true, department: true } },
    },
  });

  const workflows = await tx.approvalWorkflow.findMany({
    where: { isActive: true },
    include: { stages: { orderBy: [{ stageOrder: "asc" }, { id: "asc" }] } },
  });
  const amount = estimateRequestAmount(
    request.items.map((i) => ({ quantity: i.quantity, estimatedUnitPrice: num(i.estimatedUnitPrice) }))
  );
  const workflow = selectWorkflow(
    workflows.map((w) => ({ ...w, minAmount: num(w.minAmount), maxAmount: num(w.maxAmount) })),
    { requestType: request.requestType, department: request.requester.department, amount }
  );
  if (!workflow) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No approval workflow is configured for this request type. Contact your administrator."
    );
  }

  const lastCycle = await tx.approvalTask.aggregate({
    where: { hardwareRequestId: request.id },
    _max: { cycle: true },
  });
  const cycle = (lastCycle._max.cycle ?? 0) + 1;

  const first = nextStageOrder(workflow.stages, null);
  if (first === null) {
    await tx.hardwareRequest.update({
      where: { id: request.id },
      data: { workflowId: workflow.id, status: REQUEST_STATUS.APPROVED },
    });
    await tx.approvalHistory.create({
      data: {
        hardwareRequestId: request.id,
        actorUserId: actor.id,
        action: "Auto-approved",
        workflowVersion: workflow.version,
        comments: "Workflow has no approval stages",
      },
    });
    return;
  }

  await tx.hardwareRequest.update({ where: { id: request.id }, data: { workflowId: workflow.id } });
  await createTasksForStageGroup(
    tx,
    request,
    workflow.stages.filter((s) => s.stageOrder === first),
    cycle
  );
}

/** Close any open tasks for a request (used on reject / return / cancel). */
export async function skipOpenTasks(tx: Tx, requestId: number) {
  await tx.approvalTask.updateMany({
    where: { hardwareRequestId: requestId, status: APPROVAL_STATUS.PENDING },
    data: { status: APPROVAL_STATUS.SKIPPED, actedAt: new Date() },
  });
}

export async function listMyTasks(user: AuthUser, p: Pagination & { status?: string }) {
  const where = {
    approverUserId: user.id,
    ...(p.status ? { status: p.status } : {}),
    ...(p.search
      ? {
          request: {
            OR: [
              { requestNumber: { contains: p.search } },
              { requester: { fullName: { contains: p.search } } },
            ],
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.approvalTask.findMany({
      where,
      orderBy: [{ status: "desc" }, { createdAt: "desc" }],
      ...skipTake(p),
      include: {
        stage: { select: { name: true } },
        request: {
          select: {
            id: true,
            requestNumber: true,
            requestType: true,
            priority: true,
            status: true,
            submittedAt: true,
            requester: { select: { fullName: true, department: true } },
            _count: { select: { items: true } },
          },
        },
      },
    }),
    prisma.approvalTask.count({ where }),
  ]);
  return { items, total };
}

export async function getTask(user: AuthUser, taskId: number) {
  const task = await prisma.approvalTask.findUnique({
    where: { id: taskId },
    include: {
      stage: { select: { name: true, stageOrder: true, workflow: { select: { name: true, version: true } } } },
      request: {
        include: {
          requester: { select: { id: true, fullName: true, employeeCode: true, department: true, designation: true } },
          items: { include: { category: { select: { name: true } } } },
          history: {
            orderBy: { createdAt: "asc" },
            include: { actor: { select: { fullName: true } } },
          },
        },
      },
    },
  });
  if (!task) throw notFound("Approval task");
  if (task.approverUserId !== user.id) throw forbidden("This approval task is not assigned to you");
  return task;
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

  return prisma.$transaction(async (tx) => {
    const task = await tx.approvalTask.findUnique({
      where: { id: taskId },
      include: {
        stage: { include: { workflow: { include: { stages: true } } } },
        request: {
          include: { requester: { select: { id: true, managerId: true, fullName: true } } },
        },
      },
    });
    if (!task) throw notFound("Approval task");
    if (task.approverUserId !== user.id) throw forbidden("This approval task is not assigned to you");
    if (task.status !== APPROVAL_STATUS.PENDING) throw conflict(`This task has already been ${task.status.toLowerCase()}`);
    if (task.request.status !== REQUEST_STATUS.PENDING_APPROVAL) {
      throw conflict(`The request is no longer pending approval (current status: ${task.request.status})`);
    }

    const newTaskStatus =
      action === "approve" ? APPROVAL_STATUS.APPROVED : action === "reject" ? APPROVAL_STATUS.REJECTED : APPROVAL_STATUS.RETURNED;

    const updated = await tx.approvalTask.updateMany({
      where: { id: task.id, status: APPROVAL_STATUS.PENDING },
      data: { status: newTaskStatus, actedAt: new Date(), comments: comments?.trim() || null },
    });
    if (updated.count !== 1) throw conflict("This task was already actioned");

    const request = task.request;
    const workflow = task.stage.workflow;

    await tx.approvalHistory.create({
      data: {
        hardwareRequestId: request.id,
        taskId: task.id,
        stageName: task.stage.name,
        workflowVersion: workflow.version,
        actorUserId: user.id,
        action: newTaskStatus,
        comments: comments?.trim() || null,
      },
    });

    let requestStatus: string = request.status;

    if (action === "reject" || action === "return") {
      requestStatus = setRequestStatus(
        request.status,
        action === "reject" ? REQUEST_STATUS.REJECTED : REQUEST_STATUS.RETURNED
      );
      await skipOpenTasks(tx, request.id);
      await tx.hardwareRequest.update({ where: { id: request.id }, data: { status: requestStatus } });
      await notify(tx, {
        recipientUserId: request.requesterUserId,
        eventType: action === "reject" ? NOTIFICATION_EVENT.REQUEST_REJECTED : NOTIFICATION_EVENT.REQUEST_RETURNED,
        title: `${request.requestNumber} ${action === "reject" ? "was rejected" : "needs changes"}`,
        body: comments?.trim(),
        link: `/requests/${request.id}`,
      });
    } else {
      // A ROLE stage is satisfied by any one holder: close the sibling tasks.
      await tx.approvalTask.updateMany({
        where: {
          hardwareRequestId: request.id,
          stageId: task.stageId,
          cycle: task.cycle,
          status: APPROVAL_STATUS.PENDING,
        },
        data: { status: APPROVAL_STATUS.SKIPPED, actedAt: new Date() },
      });

      const groupStageIds = workflow.stages.filter((s) => s.stageOrder === task.stage.stageOrder).map((s) => s.id);
      const cycleTasks = await tx.approvalTask.findMany({
        where: { hardwareRequestId: request.id, cycle: task.cycle },
        select: { stageId: true, status: true },
      });

      if (isStageGroupComplete(groupStageIds, cycleTasks)) {
        const next = nextStageOrder(workflow.stages, task.stage.stageOrder);
        if (next !== null) {
          await createTasksForStageGroup(
            tx,
            request,
            workflow.stages.filter((s) => s.stageOrder === next),
            task.cycle
          );
        } else {
          requestStatus = setRequestStatus(request.status, REQUEST_STATUS.APPROVED);
          await tx.hardwareRequest.update({ where: { id: request.id }, data: { status: requestStatus } });
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

    return { taskId: task.id, taskStatus: newTaskStatus, requestStatus };
  });
}
