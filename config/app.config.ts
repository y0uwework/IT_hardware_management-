export const appConfig = {
  name: "Asset Management System",
  shortName: "AMS",
  requestNumberPrefix: "AM",
  assetTagPrefix: "AST",
  // Default reservation lifetime before it can be released by policy. */
  reservationExpiryDays: 14,
  // Default approval task due window. */
  approvalDueDays: 3,
  pagination: { defaultLimit: 20, maxLimit: 100 },
  requestTypes: ["New Asset", "Replacement", "Upgrade",] as const,
  priorities: ["Low", "Normal", "High", "Urgent"] as const,
  assetConditions: ["New", "Good", "Fair", "Poor", "Damaged"] as const,
  itemTypes: ["Hardware", "Accessory", "Consumable", "Spare Part", "Software"] as const,
  unitsOfMeasure: ["Nos", "Set", "Pair", "Box", "Pack", "Metre", "Licence"] as const,
  // Largest CSV accepted by item bulk upload.
  itemBulkUploadMaxRows: 1000,
} as const;

export type RequestType = (typeof appConfig.requestTypes)[number];
export type Priority = (typeof appConfig.priorities)[number];
