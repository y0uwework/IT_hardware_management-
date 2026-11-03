// Pure procurement / finance / maintenance rules (no database access — unit tested).
import { appConfig } from "../../config/app.config";
import { PO_STATUS, type PoStatus } from "../../config/status.config";

// Round to 2 decimals the way money is stored (half away from zero). 
export function money(n: number): number {
  // Shift by exponent notation instead of "* 100" so 1.005 rounds to 1.01, not 1.00 (binary float error).
  const r = Number(`${Math.round(Number(`${Math.abs(n)}e2`))}e-2`);
  return n < 0 ? -r : r;
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
  taxRate: number; // percent
}

export function lineAmounts(l: LineInput) {
  const net = money(l.quantity * l.unitPrice);
  const tax = money((net * l.taxRate) / 100);
  return { net, tax, total: money(net + tax) };
}

export function documentTotals(lines: LineInput[]) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal += a.net;
    taxAmount += a.tax;
  }
  subtotal = money(subtotal);
  taxAmount = money(taxAmount);
  return { subtotal, taxAmount, totalAmount: money(subtotal + taxAmount) };
}

/** PO status after a receipt, from ordered vs received quantities across all lines. */
export function poStatusAfterReceipt(lines: { quantity: number; receivedQuantity: number }[]): PoStatus {
  const all = lines.every((l) => l.receivedQuantity >= l.quantity);
  return all ? PO_STATUS.FULLY_RECEIVED : PO_STATUS.PARTIALLY_RECEIVED;
}

// ── Three-way match: PO (price, tax) × goods receipt (accepted qty) × invoice ──

export interface MatchLine {
  poItemId: number;
  description: string;
  orderedQuantity: number;
  acceptedQuantity: number; // accepted across all goods receipts
  previouslyInvoicedQuantity: number; // on other, non-rejected invoices
  poUnitPrice: number;
  poTaxRate: number;
  invoiceQuantity: number;
  invoiceUnitPrice: number;
  invoiceTaxRate: number;
}

export function matchInvoice(lines: MatchLine[]): string[] {
  const issues: string[] = [];
  const tol = appConfig.invoicePriceTolerance;
  for (const l of lines) {
    const billable = l.acceptedQuantity - l.previouslyInvoicedQuantity;
    if (l.invoiceQuantity > billable) {
      issues.push(
        `${l.description}: invoiced ${l.invoiceQuantity} but only ${Math.max(0, billable)} accepted and not yet invoiced`
      );
    }
    if (Math.abs(l.invoiceUnitPrice - l.poUnitPrice) > tol) {
      issues.push(`${l.description}: unit price ${l.invoiceUnitPrice.toFixed(2)} differs from PO price ${l.poUnitPrice.toFixed(2)}`);
    }
    if (Math.abs(l.invoiceTaxRate - l.poTaxRate) > 0.001) {
      issues.push(`${l.description}: tax rate ${l.invoiceTaxRate}% differs from PO tax rate ${l.poTaxRate}%`);
    }
  }
  return issues;
}

/** Remaining payable on an invoice. TDS withheld counts towards settling it. */
export function outstanding(total: number, paid: number) {
  return money(Math.max(0, total - paid));
}

// ── Maintenance ──

export function slaDueAt(priority: string, from: Date = new Date()): Date {
  const hours = appConfig.maintenanceSlaHours[priority] ?? appConfig.maintenanceSlaHours.Normal;
  return new Date(from.getTime() + hours * 3_600_000);
}

/** Breached when unresolved past the due time, or resolved after it. */
export function slaBreached(due: Date, resolvedAt: Date | null, now: Date = new Date()): boolean {
  return (resolvedAt ?? now).getTime() > due.getTime();
}

/** Serial numbers typed one per line (or comma separated): trimmed, blanks dropped. */
export function parseSerials(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
