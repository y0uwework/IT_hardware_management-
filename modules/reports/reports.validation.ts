// reports module — request validation (zod schemas).
import { z } from "zod";

export const optionalIsoDate = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional());

export const reportRunSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{2,60}$/),
    from: optionalIsoDate,
    to: optionalIsoDate,
    department: z.string().trim().max(100).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "From must be on or before To", path: ["to"] });
