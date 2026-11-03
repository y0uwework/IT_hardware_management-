import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../../lib/prisma";
import { AppError, conflict, forbidden, invalidTransition, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import {
  ITEM_FULFILMENT_STATUS,
  RESERVATION_STATUS,
  REQUEST_STATUS,
  REQUEST_TRANSITIONS,
  canTransition,
  type RequestStatus,
} from "../../config/status.config";
import { appConfig } from "../../config/app.config";
import { audit } from "../utils/audit";
import { userHas } from "../middleware/authorize";
import { notify, NOTIFICATION_EVENT } from "./notification.service";
import { skipOpenTasks, startApproval } from "./approval.service";
import { reserveForItem } from "./inventory.service";
import { deriveRequestStatus, itemFulfilmentStatus, remainingToPlan, type ItemState } from "./fulfilment-rules";
import type { ItReviewInput, RequestInput, RequestListQuery } from "../validators/request.validators";
import { skipTake } from "../../lib/validation";

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

function transition(from: string, to: RequestStatus): RequestStatus {
  if (!canTransition(REQUEST_TRANSITIONS, from as RequestStatus, to)) throw invalidTransition(from, to);
  return to;
}

/** Record-level scope: who may see which requests. */
function visibilityWhere(user: AuthUser, scope: RequestListQuery["scope"]): Prisma.HardwareRequestWhereInput {
  if (scope === "all") {
    if (!userHas(user, "request.view.all")) throw forbidden();
    return {};
  }
  if (scope === "it-queue") {
    if (!userHas(user, "request.it_review")) throw forbidden();
    return { status: { in: IT_REVIEWABLE } };
  }
  return { requesterUserId: user.id };
}

async function assertCanView(user: AuthUser, request: { id: number; requesterUserId: number; status: string }) {
  if (request.requesterUserId === user.id) return;
  if (userHas(user, "request.view.all")) return;
  if (userHas(user, "request.it_review") && IT_REVIEWABLE.includes(request.status as RequestStatus)) return;
  if (userHas(user, "request.it_review") && request.status === REQUEST_STATUS.FULFILLED) return;
  const task = await prisma.approvalTask.findFirst({
    where: { hardwareRequestId: request.id, approverUserId: user.id },
    select: { id: true },
  });
  if (task) return;
  throw forbidden("You do not have access to this request");
}

export async function listRequests(user: AuthUser, q: RequestListQuery) {
  const where: Prisma.HardwareRequestWhereInput = {
    ...visibilityWhere(user, q.scope),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { requestNumber: { contains: q.search } },
            { purpose: { contains: q.search } },
            { requester: { fullName: { contains: q.search } } },
          ],
        }
      : {}),
  };
  // it-queue scope sets status itself; an explicit status filter must stay inside that set.
  if (q.scope === "it-queue" && q.status) {
    where.status = IT_REVIEWABLE.includes(q.status as RequestStatus) ? q.status : "__none__";
  }
  const [items, total] = await Promise.all([
    prisma.hardwareRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...skipTake(q),
      select: {
        id: true,
        requestNumber: true,
        requestType: true,
        purpose: true,
        priority: true,
        status: true,
        requiredDate: true,
        submittedAt: true,
        createdAt: true,
        requester: { select: { id: true, fullName: true, department: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.hardwareRequest.count({ where }),
  ]);
  return { items, total };
}

export async function getRequest(user: AuthUser, id: number) {
  const request = await prisma.hardwareRequest.findUnique({
    where: { id },
    include: {
      requester: {
        select: { id: true, fullName: true, employeeCode: true, department: true, designation: true, email: true },
      },
      workflow: { select: { name: true, version: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          category: { select: { id: true, name: true, isSerialized: true } },
          reviewedBy: { select: { fullName: true } },
          reservations: {
            orderBy: { createdAt: "asc" },
            include: { warehouse: { select: { name: true } }, asset: { select: { id: true, assetTag: true } } },
          },
          assignments: {
            orderBy: { assignedAt: "asc" },
            include: { asset: { select: { id: true, assetTag: true, model: true } } },
          },
        },
      },
      tasks: {
        orderBy: [{ cycle: "asc" }, { createdAt: "asc" }],
        include: {
          approver: { select: { fullName: true } },
          stage: { select: { name: true, stageOrder: true } },
        },
      },
      history: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { fullName: true } } },
      },
    },
  });
  if (!request) throw notFound("Request");
  await assertCanView(user, request);
  return request;
}

function itemCreateData(items: RequestInput["items"]) {
  return items.map((i) => ({
    categoryId: i.categoryId,
    quantity: i.quantity,
    requestedSpecification: i.requestedSpecification,
    estimatedUnitPrice: i.estimatedUnitPrice === null ? null : new Prisma.Decimal(i.estimatedUnitPrice),
    fulfilmentStatus: ITEM_FULFILMENT_STATUS.PENDING,
  }));
}

async function assertCategoriesActive(tx: Tx, items: RequestInput["items"]) {
  const ids = Array.from(new Set(items.map((i) => i.categoryId)));
  const count = await tx.hardwareCategory.count({ where: { id: { in: ids }, isActive: true } });
  if (count !== ids.length) throw new AppError("VALIDATION_ERROR", "One or more hardware categories are invalid or inactive");
}

async function submitInTx(tx: Tx, user: AuthUser, requestId: number, from: string, correlationId?: string) {
  const status = transition(from, REQUEST_STATUS.PENDING_APPROVAL);
  const request = await tx.hardwareRequest.update({
    where: { id: requestId },
    data: { status, submittedAt: new Date() },
  });
  await tx.approvalHistory.create({
    data: {
      hardwareRequestId: requestId,
      actorUserId: user.id,
      action: from === REQUEST_STATUS.RETURNED ? "Resubmitted" : "Submitted",
    },
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

export async function createRequest(user: AuthUser, input: RequestInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    await assertCategoriesActive(tx, input.items);
    const year = new Date().getFullYear();
    const request = await tx.hardwareRequest.create({
      data: {
        // Temporary unique value; replaced with the sequential number below.
        requestNumber: `TMP-${randomUUID().slice(0, 24)}`,
        requesterUserId: user.id,
        requestType: input.requestType,
        purpose: input.purpose,
        justification: input.justification ?? null,
        priority: input.priority,
        requiredDate: input.requiredDate ? new Date(input.requiredDate) : null,
        costCentre: input.costCentre ?? null,
        status: REQUEST_STATUS.DRAFT,
        items: { create: itemCreateData(input.items) },
      },
    });
    const requestNumber = `${appConfig.requestNumberPrefix}-${year}-${String(request.id).padStart(6, "0")}`;
    await tx.hardwareRequest.update({ where: { id: request.id }, data: { requestNumber } });
    await audit(tx, {
      actorUserId: user.id,
      action: "request.create",
      entityType: "hardware_request",
      entityId: request.id,
      after: { requestNumber, ...input },
      correlationId,
    });
    if (input.submit) await submitInTx(tx, user, request.id, REQUEST_STATUS.DRAFT, correlationId);
    return { id: request.id, requestNumber };
  });
}

export async function updateRequest(user: AuthUser, id: number, input: RequestInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.hardwareRequest.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw notFound("Request");
    if (existing.requesterUserId !== user.id) throw forbidden("Only the requester can edit this request");
    if (!EDITABLE.includes(existing.status as RequestStatus)) {
      throw conflict(`Requests in "${existing.status}" status cannot be edited`);
    }
    await assertCategoriesActive(tx, input.items);
    await tx.hardwareRequestItem.deleteMany({ where: { hardwareRequestId: id } });
    await tx.hardwareRequest.update({
      where: { id },
      data: {
        requestType: input.requestType,
        purpose: input.purpose,
        justification: input.justification ?? null,
        priority: input.priority,
        requiredDate: input.requiredDate ? new Date(input.requiredDate) : null,
        costCentre: input.costCentre ?? null,
        items: { create: itemCreateData(input.items) },
      },
    });
    await audit(tx, {
      actorUserId: user.id,
      action: "request.update",
      entityType: "hardware_request",
      entityId: id,
      before: { purpose: existing.purpose, items: existing.items.length },
      after: input,
      correlationId,
    });
    if (input.submit) await submitInTx(tx, user, id, existing.status, correlationId);
    return { id, requestNumber: existing.requestNumber };
  });
}

export async function submitRequest(user: AuthUser, id: number, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.hardwareRequest.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
    if (!existing) throw notFound("Request");
    if (existing.requesterUserId !== user.id) throw forbidden("Only the requester can submit this request");
    if (!EDITABLE.includes(existing.status as RequestStatus)) {
      throw conflict(`Requests in "${existing.status}" status cannot be submitted`);
    }
    if (existing._count.items === 0) throw new AppError("VALIDATION_ERROR", "Add at least one item before submitting");
    await submitInTx(tx, user, id, existing.status, correlationId);
    return { id };
  });
}

export async function cancelRequest(user: AuthUser, id: number, reason: string | undefined, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.hardwareRequest.findUnique({ where: { id } });
    if (!existing) throw notFound("Request");
    if (existing.requesterUserId !== user.id) throw forbidden("Only the requester can cancel this request");
    if (!CANCELLABLE.includes(existing.status as RequestStatus)) {
      throw conflict(`Requests in "${existing.status}" status cannot be cancelled`);
    }
    const status = transition(existing.status, REQUEST_STATUS.CANCELLED);
    await skipOpenTasks(tx, id);
    await tx.hardwareRequest.update({ where: { id }, data: { status } });
    await tx.hardwareRequestItem.updateMany({
      where: { hardwareRequestId: id },
      data: { fulfilmentStatus: ITEM_FULFILMENT_STATUS.CANCELLED },
    });
    await tx.approvalHistory.create({
      data: { hardwareRequestId: id, actorUserId: user.id, action: "Cancelled", comments: reason ?? null },
    });
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
  const items = await tx.hardwareRequestItem.findMany({
    where: { hardwareRequestId: requestId },
    include: {
      reservations: { where: { status: RESERVATION_STATUS.ACTIVE }, select: { quantity: true } },
      assignments: { where: { acknowledgedAt: null, isActive: true }, select: { id: true } },
    },
  });
  return items.map((i) => ({
    id: i.id,
    fulfilmentStatus: i.fulfilmentStatus,
    state: {
      quantity: i.quantity,
      fulfilledQuantity: i.fulfilledQuantity,
      procurementQuantity: i.procurementQuantity,
      activeReservedQuantity: i.reservations.reduce((s, r) => s + r.quantity, 0),
      unacknowledgedAssignments: i.assignments.length,
    } satisfies ItemState,
  }));
}

/**
 * Recompute item fulfilment statuses and the request status after any fulfilment event
 * (reservation, release, assignment, issue, acknowledgement).
 */
export async function recomputeFulfilment(tx: Tx, requestId: number, actorId: number) {
  const request = await tx.hardwareRequest.findUniqueOrThrow({ where: { id: requestId } });
  const items = await loadItemStates(tx, requestId);

  for (const item of items) {
    const next = itemFulfilmentStatus(item.state);
    if (next !== item.fulfilmentStatus) {
      await tx.hardwareRequestItem.update({ where: { id: item.id }, data: { fulfilmentStatus: next } });
    }
  }

  const next = deriveRequestStatus(request.status as RequestStatus, items.map((i) => i.state));
  if (next !== request.status && canTransition(REQUEST_TRANSITIONS, request.status as RequestStatus, next)) {
    await tx.hardwareRequest.update({ where: { id: requestId }, data: { status: next } });
    await tx.approvalHistory.create({
      data: { hardwareRequestId: requestId, actorUserId: actorId, action: next },
    });
  }
  return next;
}

/**
 * IT technical review: confirm specification, reserve stock per warehouse, and mark
 * any shortfall for procurement. Supports partial fulfilment and repeated reviews.
 */
export async function saveItReview(user: AuthUser, id: number, input: ItReviewInput, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.hardwareRequest.findUnique({
      where: { id },
      include: { items: { include: { category: { select: { isSerialized: true } } } } },
    });
    if (!request) throw notFound("Request");
    if (!IT_REVIEWABLE.includes(request.status as RequestStatus)) {
      throw conflict(`Requests in "${request.status}" status are not ready for IT review`);
    }
    if (request.status === REQUEST_STATUS.APPROVED) {
      await tx.hardwareRequest.update({
        where: { id },
        data: { status: transition(request.status, REQUEST_STATUS.UNDER_IT_REVIEW) },
      });
    }

    const states = new Map((await loadItemStates(tx, id)).map((s) => [s.id, s.state]));

    for (const line of input.items) {
      const item = request.items.find((i) => i.id === line.itemId);
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
          { id: item.id, categoryId: item.categoryId, isSerialized: item.category.isSerialized },
          r.warehouseId,
          r.quantity,
          correlationId
        );
      }

      await tx.hardwareRequestItem.update({
        where: { id: item.id },
        data: {
          approvedSpecification: line.approvedSpecification ?? item.approvedSpecification ?? item.requestedSpecification,
          itReviewComments: line.comments ?? item.itReviewComments,
          procurementQuantity: line.procureQuantity,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
        },
      });
    }

    await tx.approvalHistory.create({
      data: { hardwareRequestId: id, actorUserId: user.id, action: "IT Reviewed" },
    });
    const status = await recomputeFulfilment(tx, id, user.id);

    const reservedAny = input.items.some((l) => l.reserve.length > 0);
    if (reservedAny) {
      await notify(tx, {
        recipientUserId: request.requesterUserId,
        eventType: NOTIFICATION_EVENT.STOCK_RESERVED,
        title: `Hardware reserved for ${request.requestNumber}`,
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
