import { prisma, type Tx } from "../../lib/prisma";
import { notFound } from "../../lib/errors";

export const NOTIFICATION_EVENT = {
  REQUEST_SUBMITTED: "request.submitted",
  APPROVAL_PENDING: "approval.pending",
  REQUEST_APPROVED: "request.approved",
  REQUEST_REJECTED: "request.rejected",
  REQUEST_RETURNED: "request.returned",
  STOCK_RESERVED: "stock.reserved",
  ASSET_ASSIGNED: "asset.assigned",
  ASSET_ACK_PENDING: "asset.acknowledgement_pending",
} as const;

export async function notify(
  tx: Tx,
  input: { recipientUserId: number; eventType: string; title: string; body?: string; link?: string }
) {
  await tx.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      eventType: input.eventType,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
  });
}

export async function listNotifications(userId: number, take = 20) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientUserId: userId },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markRead(userId: number, id: number | "all") {
  if (id === "all") {
    await prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return;
  }
  const r = await prisma.notification.updateMany({
    where: { id, recipientUserId: userId },
    data: { readAt: new Date() },
  });
  if (r.count === 0) throw notFound("Notification");
}
