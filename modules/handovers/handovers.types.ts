// Handovers: everything IT has issued to an employee, in one shape.
//
// Two kinds exist in the database:
//   - "asset": a serialized asset (laptop, monitor…) on dbo.asset_assignments
//   - "stock": quantity-tracked stock (keyboard, mouse, cable…) issued from a consumed
//              dbo.inventory_reservations row
// Both are acknowledged by the employee ("I received this"); a request is Fulfilled only
// when every handover on it is acknowledged. Pages use this module so acknowledgement
// looks and behaves the same everywhere.

export const HANDOVER_KINDS = ["asset", "stock"] as const;
export type HandoverKind = (typeof HANDOVER_KINDS)[number];

export function isHandoverKind(v: unknown): v is HandoverKind {
  return typeof v === "string" && (HANDOVER_KINDS as readonly string[]).includes(v);
}

export interface Handover {
  /** Unique across kinds, e.g. "asset-12" / "stock-7" — use as a React key. */
  key: string;
  kind: HandoverKind;
  /** asset_assignments.id for "asset", inventory_reservations.id for "stock". */
  id: number;
  /** Display name: manufacturer + model, item name, or category. */
  title: string;
  categoryName: string;
  quantity: number;
  issuedAt: string | null;
  acknowledgedAt: string | null;
  /** Serialized assets only. */
  asset: { id: number; assetTag: string; serialNumber: string | null; warrantyEndDate: string | null } | null;
  /** Stock only. */
  itemCode: string | null;
  warehouseName: string | null;
  accessories: string | null;
  issuedByName: string | null;
  request: { id: number; requestNumber: string } | null;
}

export interface HandoverCounts {
  total: number;
  pendingAck: number;
}
