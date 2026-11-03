// Central status definitions and allowed transitions.
// Services must call assertTransition() before changing a status.

export const REQUEST_STATUS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending Approval",
  RETURNED: "Returned for Changes",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  UNDER_IT_REVIEW: "Under IT Review",
  AWAITING_PROCUREMENT: "Awaiting Procurement",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const;
export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export const APPROVAL_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RETURNED: "Returned",
  DELEGATED: "Delegated",
  SKIPPED: "Skipped",
} as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export const ASSET_STATUS = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  ASSIGNED: "Assigned",
  UNDER_MAINTENANCE: "Under Maintenance",
  DAMAGED: "Damaged",
  RETIRED: "Retired",
  DISPOSED: "Disposed",
} as const;
export type AssetStatus = (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS];

export const PO_STATUS = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SENT_TO_VENDOR: "Sent to Vendor",
  PARTIALLY_RECEIVED: "Partially Received",
  FULLY_RECEIVED: "Fully Received",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
} as const;

export const MAINTENANCE_STATUS = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_PARTS: "Waiting for Parts",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
} as const;

export const ITEM_FULFILMENT_STATUS = {
  PENDING: "Pending",
  RESERVED: "Reserved",
  AWAITING_PROCUREMENT: "Awaiting Procurement",
  PARTIALLY_FULFILLED: "Partially Fulfilled",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const;

export const RESERVATION_STATUS = {
  ACTIVE: "Active",
  RELEASED: "Released",
  CONSUMED: "Consumed",
  EXPIRED: "Expired",
} as const;

export const MOVEMENT_TYPE = {
  RECEIPT: "Receipt",
  RESERVE: "Reserve",
  RELEASE: "Release",
  ISSUE: "Issue",
  RETURN: "Return",
  TRANSFER_OUT: "Transfer Out",
  TRANSFER_IN: "Transfer In",
  ADJUSTMENT: "Adjustment",
} as const;

export const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [REQUEST_STATUS.DRAFT]: [REQUEST_STATUS.PENDING_APPROVAL, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.SUBMITTED]: [REQUEST_STATUS.PENDING_APPROVAL, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.PENDING_APPROVAL]: [
    REQUEST_STATUS.APPROVED,
    REQUEST_STATUS.REJECTED,
    REQUEST_STATUS.RETURNED,
    REQUEST_STATUS.CANCELLED,
  ],
  [REQUEST_STATUS.RETURNED]: [REQUEST_STATUS.PENDING_APPROVAL, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.REJECTED]: [],
  [REQUEST_STATUS.APPROVED]: [REQUEST_STATUS.UNDER_IT_REVIEW, REQUEST_STATUS.CANCELLED],
  [REQUEST_STATUS.UNDER_IT_REVIEW]: [
    REQUEST_STATUS.AWAITING_PROCUREMENT,
    REQUEST_STATUS.PARTIALLY_FULFILLED,
    REQUEST_STATUS.FULFILLED,
    REQUEST_STATUS.CANCELLED,
  ],
  [REQUEST_STATUS.AWAITING_PROCUREMENT]: [REQUEST_STATUS.PARTIALLY_FULFILLED, REQUEST_STATUS.FULFILLED],
  [REQUEST_STATUS.PARTIALLY_FULFILLED]: [REQUEST_STATUS.AWAITING_PROCUREMENT, REQUEST_STATUS.FULFILLED],
  [REQUEST_STATUS.FULFILLED]: [],
  [REQUEST_STATUS.CANCELLED]: [],
};

export const ASSET_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  [ASSET_STATUS.AVAILABLE]: [ASSET_STATUS.RESERVED, ASSET_STATUS.ASSIGNED, ASSET_STATUS.UNDER_MAINTENANCE, ASSET_STATUS.DAMAGED, ASSET_STATUS.RETIRED],
  [ASSET_STATUS.RESERVED]: [ASSET_STATUS.AVAILABLE, ASSET_STATUS.ASSIGNED],
  [ASSET_STATUS.ASSIGNED]: [ASSET_STATUS.AVAILABLE, ASSET_STATUS.UNDER_MAINTENANCE, ASSET_STATUS.DAMAGED, ASSET_STATUS.RETIRED],
  [ASSET_STATUS.UNDER_MAINTENANCE]: [ASSET_STATUS.AVAILABLE, ASSET_STATUS.DAMAGED, ASSET_STATUS.RETIRED],
  [ASSET_STATUS.DAMAGED]: [ASSET_STATUS.UNDER_MAINTENANCE, ASSET_STATUS.RETIRED],
  [ASSET_STATUS.RETIRED]: [ASSET_STATUS.DISPOSED],
  [ASSET_STATUS.DISPOSED]: [],
};

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  return (map[from] ?? []).includes(to);
}

/** Statuses an asset may move to when it is returned. */
export const RETURN_NEXT_STATUSES = [
  ASSET_STATUS.AVAILABLE,
  ASSET_STATUS.UNDER_MAINTENANCE,
  ASSET_STATUS.DAMAGED,
  ASSET_STATUS.RETIRED,
] as const;

/** Visual tone for StatusBadge. */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

export function statusTone(status: string): StatusTone {
  switch (status) {
    case REQUEST_STATUS.APPROVED:
    case REQUEST_STATUS.FULFILLED:
    case APPROVAL_STATUS.APPROVED:
    case ASSET_STATUS.AVAILABLE:
    case RESERVATION_STATUS.CONSUMED:
      return "success";
    case REQUEST_STATUS.PENDING_APPROVAL:
    case REQUEST_STATUS.RETURNED:
    case REQUEST_STATUS.PARTIALLY_FULFILLED:
    case REQUEST_STATUS.AWAITING_PROCUREMENT:
    case APPROVAL_STATUS.PENDING:
    case ASSET_STATUS.RESERVED:
    case ASSET_STATUS.UNDER_MAINTENANCE:
    case RESERVATION_STATUS.ACTIVE:
      return "warning";
    case REQUEST_STATUS.REJECTED:
    case APPROVAL_STATUS.REJECTED:
    case ASSET_STATUS.DAMAGED:
      return "error";
    case REQUEST_STATUS.UNDER_IT_REVIEW:
    case ASSET_STATUS.ASSIGNED:
      return "info";
    default:
      return "neutral";
  }
}
