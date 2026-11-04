import { getPool, query, queryMany, queryOne } from "../../shared/db";
import type { AuthUser } from "../../shared/auth";
import { userHas } from "../../middlewares/authorize";
import { myHandoverCounts } from "../handovers/handovers.service";
import { APPROVAL_STATUS, ASSET_STATUS, REQUEST_STATUS, RESERVATION_STATUS } from "../../shared/config/status.config";

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
  const pool = await getPool();
  const out: Record<string, unknown> = {};
  const sections: Promise<void>[] = [];

  if (userHas(user, "request.view")) {
    sections.push(
      queryMany(
        pool,
        `SELECT
           SUM(CASE WHEN status IN (@open) THEN 1 ELSE 0 END) AS [open],
           SUM(CASE WHEN status IN (@needsAction) THEN 1 ELSE 0 END) AS needsAction
         FROM dbo.hardware_requests WHERE requester_user_id = @userId;

         SELECT TOP 5 id, request_number AS requestNumber, purpose, status, created_at AS createdAt
         FROM dbo.hardware_requests WHERE requester_user_id = @userId
         ORDER BY created_at DESC, id DESC;`,
        {
          userId: user.id,
          open: OPEN_REQUEST_STATUSES,
          needsAction: [REQUEST_STATUS.DRAFT, REQUEST_STATUS.RETURNED],
        }
      ).then(([[counts], recent]) => {
        out.myRequests = { open: counts?.open ?? 0, needsAction: counts?.needsAction ?? 0, recent };
      })
    );
  }

  if (userHas(user, "asset.view")) {
    // Same source as My assets: serialized assets + issued stock.
    sections.push(
      myHandoverCounts(user).then((c) => {
        out.myAssets = { assigned: c.total, pendingAck: c.pendingAck };
      })
    );
  }

  if (userHas(user, "request.approve")) {
    sections.push(
      queryOne(
        pool,
        `SELECT COUNT(*) AS pending, SUM(CASE WHEN due_at < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS overdue
         FROM dbo.approval_tasks WHERE approver_user_id = @userId AND status = @pending`,
        { userId: user.id, pending: APPROVAL_STATUS.PENDING }
      ).then((r) => {
        out.approvals = { pending: r?.pending ?? 0, overdue: r?.overdue ?? 0 };
      })
    );
  }

  if (userHas(user, "request.it_review")) {
    sections.push(
      queryOne(
        pool,
        `SELECT
           (SELECT COUNT(*) FROM dbo.hardware_requests WHERE status = @approved) AS awaitingReview,
           (SELECT COUNT(*) FROM dbo.hardware_requests WHERE status IN (@inFulfilment)) AS inFulfilment,
           (SELECT COUNT(*) FROM dbo.inventory_reservations WHERE status = @active) AS activeReservations`,
        {
          approved: REQUEST_STATUS.APPROVED,
          inFulfilment: [REQUEST_STATUS.UNDER_IT_REVIEW, REQUEST_STATUS.AWAITING_PROCUREMENT, REQUEST_STATUS.PARTIALLY_FULFILLED],
          active: RESERVATION_STATUS.ACTIVE,
        }
      ).then((r) => {
        out.itQueue = {
          awaitingReview: r?.awaitingReview ?? 0,
          inFulfilment: r?.inFulfilment ?? 0,
          activeReservations: r?.activeReservations ?? 0,
        };
      })
    );
  }

  if (userHas(user, "asset.view.all")) {
    sections.push(
      queryMany(
        pool,
        `SELECT status, COUNT(*) AS n FROM dbo.assets GROUP BY status;

         SELECT COUNT(*) AS n FROM dbo.assets
         WHERE warranty_end_date >= CAST(SYSUTCDATETIME() AS date)
           AND warranty_end_date <= DATEADD(day, 60, CAST(SYSUTCDATETIME() AS date))
           AND status NOT IN (@excluded);`,
        { excluded: [ASSET_STATUS.RETIRED, ASSET_STATUS.DISPOSED] }
      ).then(([grouped, [expiring]]) => {
        out.assetSummary = {
          byStatus: Object.fromEntries(grouped.map((g) => [g.status, g.n])),
          warrantyExpiring: expiring?.n ?? 0,
        };
      })
    );
  }

  if (userHas(user, "inventory.view")) {
    sections.push(
      query(
        pool,
        `SELECT TOP 8 s.quantity_available AS quantityAvailable, s.quantity_reserved AS quantityReserved,
                c.name AS [category.name], w.name AS [warehouse.name]
         FROM dbo.inventory_stock s
         JOIN dbo.hardware_categories c ON c.id = s.category_id
         JOIN dbo.warehouses w ON w.id = s.warehouse_id
         WHERE s.quantity_available <= 2 AND c.is_active = 1
         ORDER BY s.quantity_available, s.id`
      ).then((low) => {
        out.lowStock = low;
      })
    );
  }

  await Promise.all(sections);
  // Keep the section order stable for the client.
  const order = ["myRequests", "myAssets", "approvals", "itQueue", "assetSummary", "lowStock"];
  return Object.fromEntries(order.filter((k) => k in out).map((k) => [k, out[k]]));
}
