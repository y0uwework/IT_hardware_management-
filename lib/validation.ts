import { z, type ZodTypeAny } from "zod";
import { AppError } from "./errors";
import { appConfig } from "../config/app.config";

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
