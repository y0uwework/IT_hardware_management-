// Pure finance rules (no database access — unit tested).
import { appConfig } from "../../shared/config/app.config";
import { money } from "../../shared/money";

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
      issues.push(`${l.description}: invoiced ${l.invoiceQuantity} but only ${Math.max(0, billable)} accepted and not yet invoiced`);
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
