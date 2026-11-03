import { z, type ZodTypeAny } from "zod";
import { AppError } from "./errors";
import { appConfig } from "./config/app.config";

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Please correct the highlighted fields",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    );
  }
  return result.data;
}

export const idParam = z.coerce.number().int().positive();

export function parseId(value: string | string[] | undefined, name = "id"): number {
  const r = idParam.safeParse(Array.isArray(value) ? value[0] : value);
  if (!r.success) throw new AppError("VALIDATION_ERROR", `Invalid ${name}`);
  return r.data;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxLimit).default(appConfig.pagination.defaultLimit),
  search: z.string().trim().max(100).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function skipTake(p: Pagination) {
  return { skip: (p.page - 1) * p.limit, take: p.limit };
}

// ── Reusable field schemas (forms send "" for empty fields) ──

export const blankToNull = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);
export const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable());
export const optDate = z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable());
export const reqDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const optInt = (max: number) => z.preprocess(blankToNull, z.coerce.number().int().min(0).max(max).nullable());
export const id = (message = "Required") => z.coerce.number({ invalid_type_error: message }).int().positive({ message });
export const qty = z.coerce.number({ invalid_type_error: "Enter a quantity" }).int().min(1, "At least 1").max(100_000);
export const price = z.coerce.number({ invalid_type_error: "Enter a price" }).nonnegative().max(1_000_000_000);
export const taxRate = z.coerce
  .number()
  .refine((v) => (appConfig.taxRates as readonly number[]).includes(v), `Tax rate must be one of ${appConfig.taxRates.join(", ")}%`);
/** "true" / "false" query-string flag. */
export const boolFlag = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

/** Paged list with optional search and status filter. */
export const listQuery = paginationSchema.extend({ status: z.string().trim().max(40).optional() });
export type ListQuery = z.infer<typeof listQuery>;

export const commentSchema = z.object({ comments: optText(1000) });
export const reasonSchema = z.object({ reason: z.string().trim().min(3, "Give a reason").max(1000) });
