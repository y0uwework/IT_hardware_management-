import { prisma } from "../../lib/prisma";
import type { AuthUser } from "../../lib/auth";
import { userHas } from "../middleware/authorize";
import {
  APPROVAL_STATUS,
  ASSET_STATUS,
  REQUEST_STATUS,
  RESERVATION_STATUS,
} from "../../config/status.config";

const OPEN_REQUEST_STATUSES = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.PENDING_APPROVAL,
  REQUEST_STATUS.RETURNED,
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.UNDER_IT_REVIEW,
  REQUEST_STATUS.AWAITING_PROCUREMENT,
  REQUEST_STATUS.PARTIALLY_FULFILLED,
];

/**
 * One dashboard endpoint that composes only the sections the user is permitted to see.
 * (Replaces separate per-role endpoints; a user with several roles gets all their sections.)
 */
export async function getDashboard(user: AuthUser) {
  const out: Record<string, unknown> = {};

  if (userHas(user, "request.view")) {
    const [open, needsAction, recent] = await Promise.all([
      prisma.hardwareRequest.count({ where: { requesterUserId: user.id, status: { in: OPEN_REQUEST_STATUSES } } }),
      prisma.hardwareRequest.count({
        where: { requesterUserId: user.id, status: { in: [REQUEST_STATUS.DRAFT, REQUEST_STATUS.RETURNED] } },
      }),
      prisma.hardwareRequest.findMany({
        where: { requesterUserId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, requestNumber: true, purpose: true, status: true, createdAt: true },
      }),
    ]);
    out.myRequests = { open, needsAction, recent };
  }

  if (userHas(user, "asset.view")) {
    const [assigned, pendingAck] = await Promise.all([
      prisma.assetAssignment.count({ where: { userId: user.id, isActive: true } }),
      prisma.assetAssignment.count({ where: { userId: user.id, isActive: true, acknowledgedAt: null } }),
    ]);
    out.myAssets = { assigned, pendingAck };
  }

  if (userHas(user, "request.approve")) {
    const [pending, overdue] = await Promise.all([
      prisma.approvalTask.count({ where: { approverUserId: user.id, status: APPROVAL_STATUS.PENDING } }),
      prisma.approvalTask.count({
        where: { approverUserId: user.id, status: APPROVAL_STATUS.PENDING, dueAt: { lt: new Date() } },
      }),
    ]);
    out.approvals = { pending, overdue };
  }

  if (userHas(user, "request.it_review")) {
    const [awaitingReview, inFulfilment, activeReservations] = await Promise.all([
      prisma.hardwareRequest.count({ where: { status: REQUEST_STATUS.APPROVED } }),
      prisma.hardwareRequest.count({
        where: {
          status: {
            in: [REQUEST_STATUS.UNDER_IT_REVIEW, REQUEST_STATUS.AWAITING_PROCUREMENT, REQUEST_STATUS.PARTIALLY_FULFILLED],
          },
        },
      }),
      prisma.inventoryReservation.count({ where: { status: RESERVATION_STATUS.ACTIVE } }),
    ]);
    out.itQueue = { awaitingReview, inFulfilment, activeReservations };
  }

  if (userHas(user, "asset.view.all")) {
    const grouped = await prisma.asset.groupBy({ by: ["status"], _count: { _all: true } });
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    const soon = new Date(Date.now() + 60 * 86_400_000);
    const warrantyExpiring = await prisma.asset.count({
      where: {
        warrantyEndDate: { gte: new Date(), lte: soon },
        status: { notIn: [ASSET_STATUS.RETIRED, ASSET_STATUS.DISPOSED] },
      },
    });
    out.assetSummary = { byStatus, warrantyExpiring };
  }

  if (userHas(user, "inventory.view")) {
    const low = await prisma.inventoryStock.findMany({
      where: { quantityAvailable: { lte: 2 }, category: { isActive: true } },
      take: 8,
      orderBy: { quantityAvailable: "asc" },
      select: {
        quantityAvailable: true,
        quantityReserved: true,
        category: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    });
    out.lowStock = low;
  }

  return out;
}
