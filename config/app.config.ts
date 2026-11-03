export const appConfig = {
  name: "Hardware Management System",
  shortName: "HMS",
  requestNumberPrefix: "HR",
  assetTagPrefix: "AST",
  /** Default reservation lifetime before it can be released by policy. */
  reservationExpiryDays: 14,
  /** Default approval task due window. */
  approvalDueDays: 3,
  pagination: { defaultLimit: 20, maxLimit: 100 },
  requestTypes: ["New Joiner", "Replacement", "Additional", "Upgrade", "Temporary Loan"] as const,
  priorities: ["Low", "Normal", "High", "Urgent"] as const,
  assetConditions: ["New", "Good", "Fair", "Poor", "Damaged"] as const,
} as const;

export type RequestType = (typeof appConfig.requestTypes)[number];
export type Priority = (typeof appConfig.priorities)[number];
