// handovers module — one place to list and acknowledge everything issued to an employee.
import { getPool, query, queryOne } from "../../shared/db";
import type { AuthUser } from "../../shared/auth";
import { RESERVATION_STATUS } from "../../shared/config/status.config";
import { acknowledgeAssignment } from "../assets/assets.service";
import { acknowledgeIssuedStock } from "../requests/requests.service";
import type { Handover, HandoverCounts, HandoverKind } from "./handovers.types";

type Iso = Date | string | null;
const iso = (d: Iso) => (d === null ? null : d instanceof Date ? d.toISOString() : d);

/** Active serialized assets plus issued stock for the signed-in user. Pending acknowledgement first. */
export async function listMyHandovers(user: AuthUser): Promise<Handover[]> {
  const pool = await getPool();
  const [assets, stock] = await Promise.all([
    query<{
      id: number;
      assignedAt: Iso;
      acknowledgedAt: Iso;
      accessories: string | null;
      assetId: number;
      assetTag: string;
      serialNumber: string | null;
      manufacturer: string | null;
      model: string | null;
      warrantyEndDate: Iso;
      categoryName: string;
      issuedByName: string | null;
      requestId: number | null;
      requestNumber: string | null;
    }>(
      pool,
      `SELECT aa.id, aa.assigned_at AS assignedAt, aa.acknowledged_at AS acknowledgedAt, aa.accessories,
              a.id AS assetId, a.asset_tag AS assetTag, a.serial_number AS serialNumber, a.manufacturer, a.model,
              a.warranty_end_date AS warrantyEndDate, c.name AS categoryName, ib.full_name AS issuedByName,
              r.id AS requestId, r.request_number AS requestNumber
       FROM dbo.asset_assignments aa
       JOIN dbo.assets a ON a.id = aa.asset_id
       JOIN dbo.hardware_categories c ON c.id = a.category_id
       LEFT JOIN dbo.users ib ON ib.id = aa.issued_by_user_id
       LEFT JOIN dbo.hardware_request_items i ON i.id = aa.request_item_id
       LEFT JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
       WHERE aa.user_id = @userId AND aa.is_active = 1`,
      { userId: user.id }
    ),
    query<{
      id: number;
      quantity: number;
      issuedAt: Iso;
      acknowledgedAt: Iso;
      categoryName: string;
      itemCode: string | null;
      itemName: string | null;
      warehouseName: string;
      requestId: number;
      requestNumber: string;
    }>(
      pool,
      `SELECT res.id, res.quantity, res.closed_at AS issuedAt, res.acknowledged_at AS acknowledgedAt,
              c.name AS categoryName, im.item_code AS itemCode, im.item_name AS itemName, wh.name AS warehouseName,
              r.id AS requestId, r.request_number AS requestNumber
       FROM dbo.inventory_reservations res
       JOIN dbo.hardware_request_items i ON i.id = res.request_item_id
       JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
       JOIN dbo.hardware_categories c ON c.id = res.category_id
       JOIN dbo.warehouses wh ON wh.id = res.warehouse_id
       LEFT JOIN dbo.item_master im ON im.id = i.item_id
       WHERE r.requester_user_id = @userId AND res.status = @consumed AND res.asset_id IS NULL`,
      { userId: user.id, consumed: RESERVATION_STATUS.CONSUMED }
    ),
  ]);

  const rows: Handover[] = [
    ...assets.map((a) => ({
      key: `asset-${a.id}`,
      kind: "asset" as const,
      id: a.id,
      title: [a.manufacturer, a.model].filter(Boolean).join(" ") || a.assetTag,
      categoryName: a.categoryName,
      quantity: 1,
      issuedAt: iso(a.assignedAt),
      acknowledgedAt: iso(a.acknowledgedAt),
      asset: { id: a.assetId, assetTag: a.assetTag, serialNumber: a.serialNumber, warrantyEndDate: iso(a.warrantyEndDate) },
      itemCode: null,
      warehouseName: null,
      accessories: a.accessories,
      issuedByName: a.issuedByName,
      request: a.requestId && a.requestNumber ? { id: a.requestId, requestNumber: a.requestNumber } : null,
    })),
    ...stock.map((s) => ({
      key: `stock-${s.id}`,
      kind: "stock" as const,
      id: s.id,
      title: s.itemName ?? s.categoryName,
      categoryName: s.categoryName,
      quantity: s.quantity,
      issuedAt: iso(s.issuedAt),
      acknowledgedAt: iso(s.acknowledgedAt),
      asset: null,
      itemCode: s.itemCode,
      warehouseName: s.warehouseName,
      accessories: null,
      issuedByName: null,
      request: { id: s.requestId, requestNumber: s.requestNumber },
    })),
  ];

  return rows.sort((x, y) => {
    const pending = Number(!!x.acknowledgedAt) - Number(!!y.acknowledgedAt);
    if (pending !== 0) return pending;
    return (y.issuedAt ?? "").localeCompare(x.issuedAt ?? "");
  });
}

/** Dashboard tile: how many handovers the user holds and how many still need acknowledging. */
export async function myHandoverCounts(user: AuthUser): Promise<HandoverCounts> {
  const r = await queryOne<{ total: number; pendingAck: number }>(
    await getPool(),
    `SELECT SUM(total) AS total, SUM(pendingAck) AS pendingAck FROM (
       SELECT COUNT(*) AS total, SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END) AS pendingAck
       FROM dbo.asset_assignments WHERE user_id = @userId AND is_active = 1
       UNION ALL
       SELECT COUNT(*), SUM(CASE WHEN res.acknowledged_at IS NULL THEN 1 ELSE 0 END)
       FROM dbo.inventory_reservations res
       JOIN dbo.hardware_request_items i ON i.id = res.request_item_id
       JOIN dbo.hardware_requests r ON r.id = i.hardware_request_id
       WHERE r.requester_user_id = @userId AND res.status = @consumed AND res.asset_id IS NULL
     ) x`,
    { userId: user.id, consumed: RESERVATION_STATUS.CONSUMED }
  );
  return { total: r?.total ?? 0, pendingAck: r?.pendingAck ?? 0 };
}

/** The single acknowledge entry point for both kinds. Each delegate enforces "only the recipient". */
export async function acknowledgeHandover(user: AuthUser, kind: HandoverKind, id: number, correlationId?: string) {
  if (kind === "asset") await acknowledgeAssignment(user, id, correlationId);
  else await acknowledgeIssuedStock(user, id, correlationId);
  return { kind, id };
}
