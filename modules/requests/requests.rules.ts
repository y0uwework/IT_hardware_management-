// Pure fulfilment-status rules (no database access — unit tested).
import { ITEM_FULFILMENT_STATUS, REQUEST_STATUS, type RequestStatus } from "../../shared/config/status.config";

export interface ItemState {
  quantity: number;
  fulfilledQuantity: number;
  procurementQuantity: number;
  activeReservedQuantity: number;
  /** Assignments linked to this item that the employee has not yet acknowledged. */
  unacknowledgedAssignments: number;
}

export function itemFulfilmentStatus(i: ItemState): string {
  if (i.fulfilledQuantity >= i.quantity) return ITEM_FULFILMENT_STATUS.FULFILLED;
  if (i.fulfilledQuantity > 0) return ITEM_FULFILMENT_STATUS.PARTIALLY_FULFILLED;
  if (i.activeReservedQuantity > 0) return ITEM_FULFILMENT_STATUS.RESERVED;
  if (i.procurementQuantity > 0) return ITEM_FULFILMENT_STATUS.AWAITING_PROCUREMENT;
  return ITEM_FULFILMENT_STATUS.PENDING;
}

/** How many more units may still be reserved / procured for an item. */
export function remainingToPlan(i: ItemState): number {
  return Math.max(0, i.quantity - i.fulfilledQuantity - i.activeReservedQuantity - i.procurementQuantity);
}

/**
 * Derive the request status once IT review has started.
 * Fulfilled requires every item fully delivered AND every handover acknowledged.
 */
export function deriveRequestStatus(current: RequestStatus, items: ItemState[]): RequestStatus {
  const fulfilmentPhase: RequestStatus[] = [
    REQUEST_STATUS.UNDER_IT_REVIEW,
    REQUEST_STATUS.AWAITING_PROCUREMENT,
    REQUEST_STATUS.PARTIALLY_FULFILLED,
  ];
  if (!fulfilmentPhase.includes(current)) return current;

  const allDelivered = items.every((i) => i.fulfilledQuantity >= i.quantity);
  const allAcknowledged = items.every((i) => i.unacknowledgedAssignments === 0);
  if (allDelivered && allAcknowledged) return REQUEST_STATUS.FULFILLED;

  const anyDelivered = items.some((i) => i.fulfilledQuantity > 0);
  if (anyDelivered) return REQUEST_STATUS.PARTIALLY_FULFILLED;

  const awaitingProcurement = items.some(
    (i) => i.procurementQuantity > 0 && i.fulfilledQuantity + i.activeReservedQuantity < i.quantity
  );
  if (awaitingProcurement) return REQUEST_STATUS.AWAITING_PROCUREMENT;

  return current;
}
