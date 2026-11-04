// inventory module — request validation (zod schemas).
import { z } from "zod";
import { paginationSchema } from "../../shared/validation";

export const stockListSchema = paginationSchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
});

export const movementSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  warehouseId: z.coerce.number().int().positive(),
  movementType: z.enum(["Receipt", "Adjustment"]),
  quantity: z.coerce.number().int().min(-10_000).max(10_000),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

export const releaseReservationSchema = z.object({ reason: z.string().trim().min(3, "A reason is required").max(500) });

export const reservationListSchema = paginationSchema.extend({ status: z.string().max(20).optional() });

export const transferSchema = z.object({
  categoryId: z.coerce.number().int().positive({ message: "Choose a category" }),
  fromWarehouseId: z.coerce.number().int().positive({ message: "Choose the source warehouse" }),
  toWarehouseId: z.coerce.number().int().positive({ message: "Choose the destination warehouse" }),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(10_000),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});
