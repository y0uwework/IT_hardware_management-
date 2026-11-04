import type { z } from "zod";
import type { itReviewSchema, requestInputSchema, requestListSchema } from "./requests.validation";
export interface RequestDetail {
  id: number;
  requestNumber: string;
  requestType: string;
  purpose: string;
  justification: string | null;
  priority: string;
  requiredDate: string | null;
  costCentre: string | null;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  requester: {
    id: number;
    fullName: string;
    employeeCode: string;
    department: string | null;
    designation: string | null;
    email: string | null;
  };
  workflow: { name: string; version: number } | null;
  items: RequestItem[];
  tasks: {
    id: number;
    cycle: number;
    status: string;
    dueAt: string | null;
    actedAt: string | null;
    comments: string | null;
    approver: { fullName: string };
    stage: { name: string; stageOrder: number };
  }[];
  history: {
    id: number;
    action: string;
    stageName: string | null;
    comments: string | null;
    createdAt: string;
    actor: { fullName: string };
  }[];
}

/** Display name of a request line: the item master name, or the category for older lines. */
export function requestItemLabel(i: { item: { name: string } | null; category: { name: string } }) {
  return i.item?.name ?? i.category.name;
}

export interface RequestItem {
  id: number;
  quantity: number;
  requestedSpecification: string;
  approvedSpecification: string | null;
  estimatedUnitPrice: string | null;
  fulfilledQuantity: number;
  procurementQuantity: number;
  fulfilmentStatus: string;
  itReviewComments: string | null;
  reviewedAt: string | null;
  reviewedBy: { fullName: string } | null;
  category: { id: number; name: string; isSerialized: boolean };
  /** Null for lines created before the item master existed. */
  item: { id: number; code: string; name: string } | null;
  reservations: {
    id: number;
    quantity: number;
    status: string;
    expiresAt: string | null;
    closedAt: string | null;
    acknowledgedAt: string | null;
    warehouse: { name: string };
    asset: { id: number; assetTag: string } | null;
  }[];
  assignments: {
    id: number;
    assignedAt: string;
    acknowledgedAt: string | null;
    isActive: boolean;
    asset: { id: number; assetTag: string; model: string | null };
  }[];
}

export type RequestInput = z.infer<typeof requestInputSchema>;

export type RequestListQuery = z.infer<typeof requestListSchema>;

export type ItReviewInput = z.infer<typeof itReviewSchema>;
