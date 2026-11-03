// Pure procurement rules (no database access — unit tested).
import { PO_STATUS, type PoStatus } from "../../shared/config/status.config";

/** PO status after a receipt, from ordered vs received quantities across all lines. */
export function poStatusAfterReceipt(lines: { quantity: number; receivedQuantity: number }[]): PoStatus {
  const all = lines.every((l) => l.receivedQuantity >= l.quantity);
  return all ? PO_STATUS.FULLY_RECEIVED : PO_STATUS.PARTIALLY_RECEIVED;
}

/** Serial numbers typed one per line (or comma separated): trimmed, blanks dropped. */
export function parseSerials(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
