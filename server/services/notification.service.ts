import { execute, getPool, query, queryOne, type Tx } from "../../lib/db";
import { notFound } from "../../lib/errors";
import { notificationCols } from "../utils/sql-columns";

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
  await execute(
    tx,
    `INSERT INTO dbo.notifications (recipient_user_id, event_type, title, body, link)
     VALUES (@recipientUserId, @eventType, @title, @body, @link)`,
    {
      recipientUserId: input.recipientUserId,
      eventType: input.eventType,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    }
  );
}

export async function listNotifications(userId: number, take = 20) {
  const pool = await getPool();
  const [items, counts] = await Promise.all([
    query(
      pool,
      `SELECT TOP (@take) ${notificationCols("n")}
       FROM dbo.notifications n
       WHERE n.recipient_user_id = @userId
       ORDER BY n.created_at DESC, n.id DESC`,
      { userId, take }
    ),
    queryOne<{ unread: number }>(
      pool,
      `SELECT COUNT(*) AS unread FROM dbo.notifications WHERE recipient_user_id = @userId AND read_at IS NULL`,
      { userId }
    ),
  ]);
  return { items, unread: counts?.unread ?? 0 };
}

export async function markRead(userId: number, id: number | "all") {
  const pool = await getPool();
  if (id === "all") {
    await execute(
      pool,
      `UPDATE dbo.notifications SET read_at = SYSUTCDATETIME() WHERE recipient_user_id = @userId AND read_at IS NULL`,
      { userId }
    );
    return;
  }
  const count = await execute(
    pool,
    `UPDATE dbo.notifications SET read_at = SYSUTCDATETIME() WHERE id = @id AND recipient_user_id = @userId`,
    { id, userId }
  );
  if (count === 0) throw notFound("Notification");
}
