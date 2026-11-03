import { z } from "zod";
import { appConfig } from "../../shared/config/app.config";

export const requestItemSchema = z.object({
  // The item comes from the item master; its category is looked up on the server.
  itemId: z.coerce.number({ invalid_type_error: "Choose an item" }).int().positive({ message: "Choose an item" }),
  quantity: z.coerce.number().int().min(1, "At least 1").max(500, "At most 500"),
  requestedSpecification: z.string().trim().min(3, "Describe what you need").max(4000),
  estimatedUnitPrice: z
    .union([z.coerce.number().nonnegative().max(100_000_000), z.literal("").transform(() => null), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
});

export const requestInputSchema = z.object({
  requestType: z.enum(appConfig.requestTypes),
  purpose: z.string().trim().min(5, "Tell us what this is for").max(500),
  justification: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(appConfig.priorities),
  requiredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  costCentre: z.string().trim().max(100).optional().nullable(),
  items: z.array(requestItemSchema).min(1, "Add at least one item").max(20),
  submit: z.boolean().optional().default(false),
});

export const requestListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxLimit).default(appConfig.pagination.defaultLimit),
  search: z.string().trim().max(100).optional(),
  status: z.string().max(40).optional(),
  scope: z.enum(["mine", "all", "it-queue"]).default("mine"),
});

export const itReviewSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.coerce.number().int().positive(),
        approvedSpecification: z.string().trim().max(4000).optional().nullable(),
        comments: z.string().trim().max(4000).optional().nullable(),
        reserve: z
          .array(
            z.object({
              warehouseId: z.coerce.number().int().positive(),
              quantity: z.coerce.number().int().min(1).max(500),
            })
          )
          .max(10)
          .default([]),
        procureQuantity: z.coerce.number().int().min(0).max(500).default(0),
      })
    )
    .min(1),
});

export const cancelRequestSchema = z.object({ reason: z.string().trim().max(1000).optional() });
