// Item master: orderable products, each belonging to an asset category.
// Rows are soft-deleted (is_deleted = 1); deleted rows are hidden everywhere except history.

import { execute, getPool, likeContains, type Params, query, queryOne, type Tx, Where, withTransaction } from "../../shared/db";
import { AppError, notFound } from "../../shared/errors";
import type { AuthUser } from "../../shared/auth";
import { audit } from "../../shared/audit";
import { itemMasterCols } from "../../shared/sql-columns";
import { skipTake } from "../../shared/validation";
import { itemInputSchema } from "./items.validation";
import type { ItemSheetRow } from "./items.sheet";
import { appConfig } from "../../shared/config/app.config";
import type { BulkRowResult, ItemInput, ItemListQuery } from "./items.types";

const SELECT_ITEM = `SELECT ${itemMasterCols("im")}, c.id AS [category.id], c.code AS [category.code], c.name AS [category.name]
                     FROM dbo.item_master im JOIN dbo.hardware_categories c ON c.id = im.category_id`;

const COLUMNS: Record<keyof ItemInput, string> = {
  code: "item_code",
  name: "item_name",
  categoryId: "category_id",
  itemType: "item_type",
  manufacturer: "manufacturer",
  model: "model",
  partNumber: "part_number",
  description: "description",
  unitOfMeasure: "unit_of_measure",
  hsnCode: "hsn_code",
  standardCost: "standard_cost",
  warrantyMonths: "warranty_months",
  reorderLevel: "reorder_level",
  isActive: "is_active",
};
const FIELDS = Object.keys(COLUMNS) as (keyof ItemInput)[];

const loadItem = (tx: Tx, id: number) => queryOne(tx, `${SELECT_ITEM} WHERE im.id = @id AND im.is_deleted = 0`, { id });

export async function listItems(q: ItemListQuery) {
  const where = new Where().add("im.is_deleted = 0");
  if (q.search) {
    where.add(
      "(im.item_code LIKE @search OR im.item_name LIKE @search OR im.manufacturer LIKE @search OR im.model LIKE @search OR im.part_number LIKE @search)",
      { search: likeContains(q.search) }
    );
  }
  if (q.categoryId) where.add("im.category_id = @categoryId", { categoryId: q.categoryId });
  if (q.status) where.add("im.is_active = @active", { active: q.status === "active" });

  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(pool, `${SELECT_ITEM} ${where} ORDER BY im.item_name, im.id OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`, {
      ...where.params,
      ...skipTake(q),
    }),
    queryOne<{ total: number }>(
      pool,
      `SELECT COUNT(*) AS total FROM dbo.item_master im JOIN dbo.hardware_categories c ON c.id = im.category_id ${where}`,
      where.params
    ),
  ]);
  return { items, total: total?.total ?? 0 };
}

/** Active items in active categories — the pick list wherever items are chosen (e.g. requests). */
export async function listItemOptions() {
  return query(
    await getPool(),
    `${SELECT_ITEM} WHERE im.is_deleted = 0 AND im.is_active = 1 AND c.is_active = 1 ORDER BY c.name, im.item_name, im.id`
  );
}

/** Existing (not deleted) items that clash with this code or name. */
export async function findDuplicates(tx: Tx, code: string | undefined, name: string | undefined, excludeId?: number) {
  const where = new Where().add("is_deleted = 0");
  if (excludeId) where.add("id <> @excludeId", { excludeId });
  const clauses: string[] = [];
  const params: Params = {};
  if (code) {
    clauses.push("item_code = @code");
    params.code = code;
  }
  if (name) {
    clauses.push("item_name = @name");
    params.name = name;
  }
  if (!clauses.length) return { code: null, name: null };
  where.add(`(${clauses.join(" OR ")})`, params);
  const rows = await query<{ id: number; itemCode: string; itemName: string }>(
    tx,
    `SELECT id, item_code AS itemCode, item_name AS itemName FROM dbo.item_master ${where}`,
    where.params
  );
  // SQL Server comparison is case-insensitive (default collation); mirror that here.
  const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
  return {
    code: code ? (rows.find((r) => same(r.itemCode, code)) ?? null) : null,
    name: name ? (rows.find((r) => same(r.itemName, name)) ?? null) : null,
  };
}

export async function checkItemDuplicates(code?: string, name?: string, excludeId?: number) {
  const d = await findDuplicates(await getPool(), code?.toUpperCase(), name, excludeId);
  return {
    codeExists: !!d.code,
    nameExists: !!d.name,
    existing: d.code ?? d.name ?? null,
  };
}

async function assertNoDuplicates(tx: Tx, input: ItemInput, excludeId?: number) {
  const d = await findDuplicates(tx, input.code, input.name, excludeId);
  const errors: { path: string; message: string }[] = [];
  if (d.code) errors.push({ path: "code", message: `Item code ${d.code.itemCode} already exists` });
  if (d.name) errors.push({ path: "name", message: `An item named "${d.name.itemName}" already exists (${d.name.itemCode})` });
  if (errors.length) throw new AppError("VALIDATION_ERROR", "This item already exists in the item master", errors);
}

async function assertCategory(tx: Tx, categoryId: number, mustBeActive: boolean) {
  const c = await queryOne<{ isActive: boolean }>(tx, `SELECT is_active AS isActive FROM dbo.hardware_categories WHERE id = @id`, {
    id: categoryId,
  });
  if (!c || (mustBeActive && !c.isActive)) {
    throw new AppError("VALIDATION_ERROR", "Please correct the highlighted fields", [
      { path: "categoryId", message: "Choose an active category" },
    ]);
  }
}

async function insertItem(tx: Tx, actor: AuthUser, input: ItemInput) {
  const params: Params = { createdBy: actor.id };
  for (const f of FIELDS) params[f] = input[f];
  const row = await queryOne<{ id: number }>(
    tx,
    `INSERT INTO dbo.item_master (${FIELDS.map((f) => `[${COLUMNS[f]}]`).join(", ")}, created_by_user_id)
     OUTPUT INSERTED.id
     VALUES (${FIELDS.map((f) => `@${f}`).join(", ")}, @createdBy)`,
    params
  );
  return row!.id;
}

export async function createItem(actor: AuthUser, input: ItemInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    await assertCategory(tx, input.categoryId, true);
    await assertNoDuplicates(tx, input);
    const id = await insertItem(tx, actor, input);
    const row = (await loadItem(tx, id))!;
    await audit(tx, { actorUserId: actor.id, action: "item.create", entityType: "item", entityId: id, after: row, correlationId });
    return row;
  });
}

export async function updateItem(actor: AuthUser, id: number, input: ItemInput, correlationId?: string) {
  return withTransaction(async (tx) => {
    const before = await loadItem(tx, id);
    if (!before) throw notFound("Item");
    // Keeping an item in a category that was later deactivated is fine; moving it into one is not.
    await assertCategory(tx, input.categoryId, input.categoryId !== before.categoryId);
    await assertNoDuplicates(tx, input, id);
    const params: Params = { id, updatedBy: actor.id };
    for (const f of FIELDS) params[f] = input[f];
    await execute(
      tx,
      `UPDATE dbo.item_master
       SET ${FIELDS.map((f) => `[${COLUMNS[f]}] = @${f}`).join(", ")},
           updated_by_user_id = @updatedBy, updated_at = SYSUTCDATETIME()
       WHERE id = @id AND is_deleted = 0`,
      params
    );
    const row = (await loadItem(tx, id))!;
    await audit(tx, { actorUserId: actor.id, action: "item.update", entityType: "item", entityId: id, before, after: row, correlationId });
    return row;
  });
}

/** Soft delete: the row stays for history (requests keep pointing at it) but disappears from the master. */
export async function deleteItem(actor: AuthUser, id: number, correlationId?: string) {
  return withTransaction(async (tx) => {
    const before = await loadItem(tx, id);
    if (!before) throw notFound("Item");
    await execute(
      tx,
      `UPDATE dbo.item_master
       SET is_deleted = 1, is_active = 0, deleted_at = SYSUTCDATETIME(), deleted_by_user_id = @actor,
           updated_by_user_id = @actor, updated_at = SYSUTCDATETIME()
       WHERE id = @id AND is_deleted = 0`,
      { id, actor: actor.id }
    );
    await audit(tx, { actorUserId: actor.id, action: "item.delete", entityType: "item", entityId: id, before, correlationId });
    return { id };
  });
}

// ── Bulk upload ──

function sheetRowToInput(r: ItemSheetRow, categoryId: number | undefined) {
  return {
    code: r.item_code ?? "",
    name: r.item_name ?? "",
    categoryId: categoryId ?? 0,
    itemType: r.item_type ?? "",
    manufacturer: r.manufacturer,
    model: r.model,
    partNumber: r.part_number,
    description: r.description,
    unitOfMeasure: r.unit_of_measure,
    hsnCode: r.hsn_code,
    standardCost: r.standard_cost?.replace(/,/g, ""),
    warrantyMonths: r.warranty_months,
    reorderLevel: r.reorder_level,
    isActive: r.is_active,
  };
}

const FIELD_LABELS: Record<string, string> = {
  code: "item_code",
  name: "item_name",
  categoryId: "category_code",
  itemType: "item_type",
  unitOfMeasure: "unit_of_measure",
  hsnCode: "hsn_code",
  standardCost: "standard_cost",
  warrantyMonths: "warranty_months",
  reorderLevel: "reorder_level",
  isActive: "is_active",
};

/**
 * Validate every row, skip rows whose code or name already exists (in the database or earlier
 * in the same sheet), and insert the rest in one transaction. Item types and units are matched
 * case-insensitively so "hardware" and "nos" are accepted.
 */
export async function bulkCreateItems(actor: AuthUser, rows: ItemSheetRow[], correlationId?: string) {
  return withTransaction(async (tx) => {
    const categories = await query<{ id: number; code: string; isActive: boolean }>(
      tx,
      `SELECT id, code, is_active AS isActive FROM dbo.hardware_categories`
    );
    const categoryByCode = new Map(categories.map((c) => [c.code.toUpperCase(), c]));
    const existing = await query<{ itemCode: string; itemName: string }>(
      tx,
      `SELECT item_code AS itemCode, item_name AS itemName FROM dbo.item_master WITH (UPDLOCK, HOLDLOCK) WHERE is_deleted = 0`
    );
    const codes = new Map(existing.map((e) => [e.itemCode.toUpperCase(), "database"]));
    const names = new Map(existing.map((e) => [e.itemName.trim().toUpperCase(), "database"]));

    const { itemTypes, unitsOfMeasure } = appConfig;
    const canon = (list: readonly string[], v: string | undefined) => list.find((x) => x.toUpperCase() === v?.trim().toUpperCase()) ?? v;

    const results: BulkRowResult[] = [];
    const toInsert: { result: BulkRowResult; input: ItemInput }[] = [];

    rows.forEach((raw, i) => {
      const result: BulkRowResult = { row: i + 2, code: (raw.item_code ?? "").toUpperCase(), name: raw.item_name ?? "", status: "error", messages: [] };
      results.push(result);

      const catCode = raw.category_code?.trim().toUpperCase() ?? "";
      const category = categoryByCode.get(catCode);
      if (!catCode) result.messages.push("category_code: required");
      else if (!category) result.messages.push(`category_code: "${raw.category_code}" does not exist`);
      else if (!category.isActive) result.messages.push(`category_code: "${raw.category_code}" is inactive`);

      const parsed = itemInputSchema.safeParse({
        ...sheetRowToInput(raw, category?.id),
        itemType: canon(itemTypes, raw.item_type),
        unitOfMeasure: canon(unitsOfMeasure, raw.unit_of_measure),
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? "");
          if (field === "categoryId") continue; // reported above with the sheet's wording
          result.messages.push(`${FIELD_LABELS[field] ?? field}: ${issue.message}`);
        }
      }
      if (result.messages.length || !parsed.success) return;

      const input = parsed.data;
      const nameKey = input.name.trim().toUpperCase();
      const codeSeen = codes.get(input.code);
      const nameSeen = names.get(nameKey);
      if (codeSeen || nameSeen) {
        result.status = codeSeen === "database" || nameSeen === "database" ? "exists" : "error";
        if (codeSeen) result.messages.push(codeSeen === "database" ? "item_code already exists" : `item_code repeats row ${codeSeen}`);
        if (nameSeen) result.messages.push(nameSeen === "database" ? "item_name already exists" : `item_name repeats row ${nameSeen}`);
        return;
      }
      codes.set(input.code, String(result.row));
      names.set(nameKey, String(result.row));
      result.code = input.code;
      toInsert.push({ result, input });
    });

    const createdIds: number[] = [];
    for (const { result, input } of toInsert) {
      createdIds.push(await insertItem(tx, actor, input));
      result.status = "created";
    }

    if (createdIds.length) {
      await audit(tx, {
        actorUserId: actor.id,
        action: "item.bulk_create",
        entityType: "item",
        entityId: "bulk",
        after: { count: createdIds.length, ids: createdIds, codes: toInsert.map((t) => t.input.code) },
        correlationId,
      });
    }

    return {
      created: results.filter((r) => r.status === "created").length,
      exists: results.filter((r) => r.status === "exists").length,
      failed: results.filter((r) => r.status === "error").length,
      results,
    };
  });
}
