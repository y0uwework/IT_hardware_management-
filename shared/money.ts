// Money arithmetic shared by procurement and finance (pure — unit tested).
// Amounts are stored as DECIMAL(18,2); round the same way everywhere.

/** Round to 2 decimals, half away from zero. */
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
