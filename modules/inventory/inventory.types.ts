// inventory module — types.

export interface Reservation {
  id: number;
  requestItemId: number;
  categoryId: number;
  warehouseId: number;
  assetId: number | null;
  quantity: number;
  status: string;
  expiresAt: Date | null;
  createdByUserId: number;
  createdAt: Date;
  closedAt: Date | null;
  /** Set when the employee confirms receipt of issued quantity-tracked stock. */
  acknowledgedAt: Date | null;
}
