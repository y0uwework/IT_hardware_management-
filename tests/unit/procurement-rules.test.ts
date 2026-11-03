import { describe, expect, it } from "vitest";
import {
  documentTotals,
  lineAmounts,
  matchInvoice,
  money,
  outstanding,
  parseSerials,
  poStatusAfterReceipt,
  slaBreached,
  slaDueAt,
  type MatchLine,
} from "../../server/services/procurement-rules";
import { fiscalYearOf, fiscalYearRange } from "../../config/app.config";
import { INVOICE_STATUS, INVOICE_TRANSITIONS, MAINTENANCE_STATUS, MAINTENANCE_TRANSITIONS, PO_STATUS, PO_TRANSITIONS, canTransition } from "../../config/status.config";
import { filterSidebar } from "../../lib/permissions";
import { sidebarConfig } from "../../config/sidebar.config";

describe("money & line amounts", () => {
  it("rounds to paise", () => {
    expect(money(1.005)).toBe(1.01);
    expect(money(10.004)).toBe(10);
    expect(money(-2.345)).toBe(-2.35);
  });

  it("computes net, GST and total per line and per document", () => {
    expect(lineAmounts({ quantity: 3, unitPrice: 999.99, taxRate: 18 })).toEqual({ net: 2999.97, tax: 539.99, total: 3539.96 });
    expect(documentTotals([
      { quantity: 2, unitPrice: 72000, taxRate: 18 },
      { quantity: 5, unitPrice: 350, taxRate: 0 },
    ])).toEqual({ subtotal: 145750, taxAmount: 25920, totalAmount: 171670 });
  });

  it("never reports a negative outstanding", () => {
    expect(outstanding(1000, 400)).toBe(600);
    expect(outstanding(1000, 1000.01)).toBe(0);
  });
});

describe("goods receipt", () => {
  it("is fully received only when every line is", () => {
    expect(poStatusAfterReceipt([{ quantity: 2, receivedQuantity: 2 }, { quantity: 1, receivedQuantity: 0 }])).toBe(PO_STATUS.PARTIALLY_RECEIVED);
    expect(poStatusAfterReceipt([{ quantity: 2, receivedQuantity: 2 }, { quantity: 1, receivedQuantity: 1 }])).toBe(PO_STATUS.FULLY_RECEIVED);
  });

  it("splits serial numbers on lines or commas", () => {
    expect(parseSerials(" SN1\r\nSN2,SN3\n\n ")).toEqual(["SN1", "SN2", "SN3"]);
    expect(parseSerials(null)).toEqual([]);
  });
});

describe("three-way match", () => {
  const base: MatchLine = {
    poItemId: 1,
    description: "Laptop",
    orderedQuantity: 5,
    acceptedQuantity: 3,
    previouslyInvoicedQuantity: 1,
    poUnitPrice: 72000,
    poTaxRate: 18,
    invoiceQuantity: 2,
    invoiceUnitPrice: 72000,
    invoiceTaxRate: 18,
  };

  it("passes when quantity is within accepted-not-yet-invoiced and price/tax match", () => {
    expect(matchInvoice([base])).toEqual([]);
  });

  it("flags over-billing, price and tax differences", () => {
    const issues = matchInvoice([{ ...base, invoiceQuantity: 3, invoiceUnitPrice: 72500, invoiceTaxRate: 28 }]);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatch(/invoiced 3 but only 2/);
    expect(issues[1]).toMatch(/72500\.00 differs/);
    expect(issues[2]).toMatch(/28% differs/);
  });

  it("tolerates a paisa of rounding", () => {
    expect(matchInvoice([{ ...base, invoiceUnitPrice: 72000.01 }])).toEqual([]);
  });
});

describe("status transitions", () => {
  it("PO: approval is required before sending, and receipts can't skip sending", () => {
    expect(canTransition(PO_TRANSITIONS, PO_STATUS.DRAFT, PO_STATUS.APPROVED)).toBe(false);
    expect(canTransition(PO_TRANSITIONS, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED)).toBe(true);
    expect(canTransition(PO_TRANSITIONS, PO_STATUS.APPROVED, PO_STATUS.FULLY_RECEIVED)).toBe(false);
    expect(canTransition(PO_TRANSITIONS, PO_STATUS.FULLY_RECEIVED, PO_STATUS.CANCELLED)).toBe(false);
  });

  it("Invoice: must be verified before approval and approved before payment", () => {
    expect(canTransition(INVOICE_TRANSITIONS, INVOICE_STATUS.RECEIVED, INVOICE_STATUS.APPROVED)).toBe(false);
    expect(canTransition(INVOICE_TRANSITIONS, INVOICE_STATUS.VERIFIED, INVOICE_STATUS.APPROVED)).toBe(true);
    expect(canTransition(INVOICE_TRANSITIONS, INVOICE_STATUS.VERIFIED, INVOICE_STATUS.PAID)).toBe(false);
  });

  it("Maintenance: resolved tickets can be closed or reopened, closed ones only reopened", () => {
    expect(canTransition(MAINTENANCE_TRANSITIONS, MAINTENANCE_STATUS.RESOLVED, MAINTENANCE_STATUS.CLOSED)).toBe(true);
    expect(canTransition(MAINTENANCE_TRANSITIONS, MAINTENANCE_STATUS.CLOSED, MAINTENANCE_STATUS.IN_PROGRESS)).toBe(true);
    expect(canTransition(MAINTENANCE_TRANSITIONS, MAINTENANCE_STATUS.OPEN, MAINTENANCE_STATUS.RESOLVED)).toBe(false);
  });
});

describe("SLA", () => {
  const t0 = new Date("2026-11-03T09:00:00Z");
  it("adds the priority's hours", () => {
    expect(slaDueAt("Urgent", t0).toISOString()).toBe("2026-11-03T17:00:00.000Z");
    expect(slaDueAt("Unknown", t0).toISOString()).toBe("2026-11-06T09:00:00.000Z"); // falls back to Normal (72h)
  });
  it("is breached when resolved late or still open past due", () => {
    const due = slaDueAt("High", t0);
    expect(slaBreached(due, new Date("2026-11-04T08:59:00Z"))).toBe(false);
    expect(slaBreached(due, null, new Date("2026-11-04T09:01:00Z"))).toBe(true);
  });
});

describe("fiscal year", () => {
  it("labels April–March years", () => {
    expect(fiscalYearOf(new Date(2026, 10, 3))).toBe("2026-27");
    expect(fiscalYearOf(new Date(2027, 2, 31))).toBe("2026-27");
    expect(fiscalYearOf(new Date(2027, 3, 1))).toBe("2027-28");
    const r = fiscalYearRange("2026-27");
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2027-04-01");
  });
});

describe("sidebar for the new modules", () => {
  it("points a PO approver straight at purchase orders", () => {
    const proc = filterSidebar(sidebarConfig, { permissions: ["procurement.po.approve"] }).find((i) => i.label === "Procurement")!;
    expect(proc.route).toBe("/procurement/purchase-orders");
    expect(proc.children?.map((c) => c.label)).toEqual(["Purchase Orders"]);
  });
  it("shows maintenance to employees who can report issues", () => {
    expect(filterSidebar(sidebarConfig, { permissions: ["maintenance.report"] }).map((i) => i.label)).toContain("Maintenance");
  });
});
