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

  // ── Procurement & finance ──
  numberPrefixes: {
    requisition: "PR",
    quotation: "QT",
    purchaseOrder: "PO",
    goodsReceipt: "GRN",
    invoice: "INV",
    payment: "PAY",
    maintenance: "MT",
  },
  // Fiscal year starts in this month (4 = April, Indian FY "2026-27").
  fiscalYearStartMonth: 4,
  // GST / tax rates offered on PO, quotation and invoice lines (%).
  taxRates: [0, 5, 12, 18, 28] as const,
  paymentModes: ["NEFT", "RTGS", "IMPS", "UPI", "Cheque", "Card", "Cash"] as const,
  // Invoice line may differ from the PO price by at most this much before it is a discrepancy.
  invoicePriceTolerance: 0.01,

  // ── Maintenance ──
  issueCategories: ["Hardware fault", "Damage", "Performance", "Software", "Peripheral", "Other"] as const,
  severities: ["Minor", "Major", "Critical"] as const,
  // Resolution target per priority, in hours from reporting.
  maintenanceSlaHours: { Low: 120, Normal: 72, High: 24, Urgent: 8 } as Record<string, number>,
  // A ticket on the same asset within this many days of an earlier one is flagged as a repeat issue.
  repeatIssueWindowDays: 90,
} as const;

export type RequestType = (typeof appConfig.requestTypes)[number];
export type Priority = (typeof appConfig.priorities)[number];

/** Fiscal year label for a date, e.g. 2026-11-03 → "2026-27" when the year starts in April. */
export function fiscalYearOf(d: Date): string {
  const start = d.getMonth() + 1 >= appConfig.fiscalYearStartMonth ? d.getFullYear() : d.getFullYear() - 1;
  return (appConfig.fiscalYearStartMonth as number) === 1 ? String(start) : `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** [start, end) dates of a fiscal year label produced by fiscalYearOf. */
export function fiscalYearRange(label: string): { start: Date; end: Date } {
  const startYear = Number(label.slice(0, 4));
  const start = new Date(Date.UTC(startYear, appConfig.fiscalYearStartMonth - 1, 1));
  const end = new Date(Date.UTC(startYear + 1, appConfig.fiscalYearStartMonth - 1, 1));
  return { start, end };
}
