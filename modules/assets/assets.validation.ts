import { z } from "zod";
import { appConfig } from "../../shared/config/app.config";
import { RETURN_NEXT_STATUSES } from "../../shared/config/status.config";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const assetCreateSchema = z.object({
  categoryId: z.coerce.number().int().positive({ message: "Choose a category" }),
  warehouseId: z.coerce.number().int().positive({ message: "Choose a warehouse" }),
  serialNumber: optionalText(100),
  manufacturer: optionalText(100),
  model: optionalText(150),
  specification: optionalText(4000),
  purchaseDate: optionalDate,
  purchaseCost: z
    .union([z.coerce.number().nonnegative().max(100_000_000), z.literal("").transform(() => null), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  warrantyEndDate: optionalDate,
  condition: z.enum(appConfig.assetConditions).default("New"),
  notes: optionalText(4000),
});

export const assetUpdateSchema = assetCreateSchema
  .pick({ serialNumber: true, manufacturer: true, model: true, specification: true, warrantyEndDate: true, notes: true })
  .partial();

export const assignSchema = z.object({
  userId: z.coerce.number().int().positive({ message: "Choose an employee" }),
  requestItemId: z.coerce.number().int().positive().optional().nullable(),
  condition: z.enum(appConfig.assetConditions),
  accessories: optionalText(500),
  notes: optionalText(4000),
});

export const returnSchema = z.object({
  condition: z.enum(appConfig.assetConditions),
  accessories: optionalText(500),
  inspectionNotes: optionalText(4000),
  nextStatus: z.enum(RETURN_NEXT_STATUSES),
  warehouseId: z.coerce.number().int().positive().optional().nullable(),
});

export const assetListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxLimit).default(appConfig.pagination.defaultLimit),
  search: z.string().trim().max(100).optional(),
  status: z.string().max(30).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
});

export const transferSchema = z.object({
  toWarehouseId: z.coerce.number().int().positive({ message: "Choose the destination warehouse" }),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});
