import { z } from "zod";
import { appConfig } from "../../config/app.config";

/** "" / whitespace / undefined → null, so optional form and CSV fields can be left blank. */
const blankToNull = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);

const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());

const optionalInt = (max: number, label: string) =>
  z.preprocess(
    blankToNull,
    z.coerce.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0).max(max).nullable()
  );

const boolLike = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  if (["", "yes", "y", "true", "1", "active"].includes(s)) return true;
  if (["no", "n", "false", "0", "inactive"].includes(s)) return false;
  return v;
}, z.boolean({ invalid_type_error: "Use Yes or No" }));

export const itemInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "At least 2 characters")
    .max(50)
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_\-/.]+$/, "Letters, digits, - _ / . only")),
  name: z.string().trim().min(2, "At least 2 characters").max(200),
  categoryId: z.coerce.number().int().positive({ message: "Choose a category" }),
  itemType: z.enum(appConfig.itemTypes, { errorMap: () => ({ message: `One of: ${appConfig.itemTypes.join(", ")}` }) }),
  manufacturer: optionalText(100),
  model: optionalText(150),
  partNumber: optionalText(100),
  description: optionalText(1000),
  unitOfMeasure: z.preprocess(
    (v) => blankToNull(v) ?? "Nos",
    z.enum(appConfig.unitsOfMeasure, { errorMap: () => ({ message: `One of: ${appConfig.unitsOfMeasure.join(", ")}` }) })
  ),
  hsnCode: z.preprocess(blankToNull, z.string().trim().regex(/^\d{4,8}$/, "HSN/SAC code is 4–8 digits").nullable()),
  standardCost: z.preprocess(
    blankToNull,
    z.coerce.number({ invalid_type_error: "Standard cost must be a number" }).nonnegative().max(100_000_000).nullable()
  ),
  warrantyMonths: optionalInt(240, "Warranty months"),
  reorderLevel: optionalInt(1_000_000, "Reorder level"),
  isActive: z.preprocess((v) => (v === undefined ? true : v), boolLike),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const itemListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxLimit).default(appConfig.pagination.defaultLimit),
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});
export type ItemListQuery = z.infer<typeof itemListSchema>;

export const itemCheckSchema = z.object({
  code: z.string().trim().max(50).optional(),
  name: z.string().trim().max(200).optional(),
  excludeId: z.coerce.number().int().positive().optional(),
});

/**
 * Bulk upload: rows as parsed from the CSV, keyed by the sample sheet's column headers
 * (lib/item-sheet.ts). Each row is validated individually so the response can report per-row errors.
 */
export const itemBulkSchema = z.object({
  rows: z
    .array(z.record(z.string().max(4000)))
    .min(1, "The sheet has no item rows")
    .max(appConfig.itemBulkUploadMaxRows, `Upload at most ${appConfig.itemBulkUploadMaxRows} rows at a time`),
});
