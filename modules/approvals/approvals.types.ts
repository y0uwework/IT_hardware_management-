// approvals module — types.

export const APPROVER_TYPE = { MANAGER: "MANAGER", ROLE: "ROLE" } as const;

export type ApprovalAction = "approve" | "reject" | "return";
