import { randomUUID } from "crypto";
import { execute, type Tx } from "./db";

/** Unique placeholder for a NOT NULL UNIQUE number column until the real number is known. */
export const tmpNumber = () => `TMP-${randomUUID().slice(0, 24)}`;

/**
 * Give a freshly inserted row its sequential business number, e.g. PO-2026-000042.
 * The number is derived from the identity value, so it is unique without a counter table.
 * `table` and `column` always come from code, never from input.
 */
export async function assignNumber(tx: Tx, table: string, column: string, prefix: string, id: number) {
  const number = `${prefix}-${new Date().getFullYear()}-${String(id).padStart(6, "0")}`;
  await execute(tx, `UPDATE dbo.${table} SET ${column} = @number WHERE id = @id`, { number, id });
  return number;
}
