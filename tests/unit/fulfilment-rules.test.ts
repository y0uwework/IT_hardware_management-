import { describe, expect, it } from "vitest";
import { deriveRequestStatus, itemFulfilmentStatus, remainingToPlan, type ItemState } from "../../modules/requests/requests.rules";
import { REQUEST_STATUS } from "../../shared/config/status.config";

const item = (over: Partial<ItemState>): ItemState => ({
  quantity: 1,
  fulfilledQuantity: 0,
  procurementQuantity: 0,
  activeReservedQuantity: 0,
  unacknowledgedAssignments: 0,
  ...over,
});

describe("itemFulfilmentStatus", () => {
  it("progresses Pending → Reserved → Partially → Fulfilled", () => {
    expect(itemFulfilmentStatus(item({ quantity: 2 }))).toBe("Pending");
    expect(itemFulfilmentStatus(item({ quantity: 2, procurementQuantity: 2 }))).toBe("Awaiting Procurement");
    expect(itemFulfilmentStatus(item({ quantity: 2, activeReservedQuantity: 1 }))).toBe("Reserved");
    expect(itemFulfilmentStatus(item({ quantity: 2, fulfilledQuantity: 1 }))).toBe("Partially Fulfilled");
    expect(itemFulfilmentStatus(item({ quantity: 2, fulfilledQuantity: 2 }))).toBe("Fulfilled");
  });
});

describe("remainingToPlan", () => {
  it("subtracts delivered, reserved and procurement units", () => {
    expect(remainingToPlan(item({ quantity: 5, fulfilledQuantity: 1, activeReservedQuantity: 2, procurementQuantity: 1 }))).toBe(1);
    expect(remainingToPlan(item({ quantity: 1, fulfilledQuantity: 2 }))).toBe(0);
  });
});

describe("deriveRequestStatus (PRD §14.4 partial fulfilment)", () => {
  // 1 laptop, 2 monitors, 1 keyboard
  const laptop = item({ quantity: 1 });
  const monitors = item({ quantity: 2 });
  const keyboard = item({ quantity: 1 });

  it("leaves non-fulfilment statuses untouched", () => {
    expect(deriveRequestStatus(REQUEST_STATUS.PENDING_APPROVAL, [laptop])).toBe(REQUEST_STATUS.PENDING_APPROVAL);
  });

  it("is Awaiting Procurement when a shortfall is sent to procurement", () => {
    const s = deriveRequestStatus(REQUEST_STATUS.UNDER_IT_REVIEW, [
      { ...laptop, activeReservedQuantity: 1 },
      { ...monitors, activeReservedQuantity: 1, procurementQuantity: 1 },
      { ...keyboard, procurementQuantity: 1 },
    ]);
    expect(s).toBe(REQUEST_STATUS.AWAITING_PROCUREMENT);
  });

  it("is Partially Fulfilled once some items are delivered", () => {
    const s = deriveRequestStatus(REQUEST_STATUS.AWAITING_PROCUREMENT, [
      { ...laptop, fulfilledQuantity: 1 },
      { ...monitors, fulfilledQuantity: 1, procurementQuantity: 1 },
      { ...keyboard, procurementQuantity: 1 },
    ]);
    expect(s).toBe(REQUEST_STATUS.PARTIALLY_FULFILLED);
  });

  it("waits for acknowledgement before Fulfilled", () => {
    const delivered = [
      { ...laptop, fulfilledQuantity: 1, unacknowledgedAssignments: 1 },
      { ...monitors, fulfilledQuantity: 2 },
      { ...keyboard, fulfilledQuantity: 1 },
    ];
    expect(deriveRequestStatus(REQUEST_STATUS.PARTIALLY_FULFILLED, delivered)).toBe(REQUEST_STATUS.PARTIALLY_FULFILLED);
    delivered[0].unacknowledgedAssignments = 0;
    expect(deriveRequestStatus(REQUEST_STATUS.PARTIALLY_FULFILLED, delivered)).toBe(REQUEST_STATUS.FULFILLED);
  });

  it("stays Under IT Review when everything is only reserved", () => {
    expect(deriveRequestStatus(REQUEST_STATUS.UNDER_IT_REVIEW, [{ ...laptop, activeReservedQuantity: 1 }])).toBe(
      REQUEST_STATUS.UNDER_IT_REVIEW
    );
  });
});
