// assets module — types.
import type { z } from "zod";
import type { assetCreateSchema, assetListSchema, assetUpdateSchema, assignSchema, returnSchema, transferSchema } from "./assets.validation";

export type AssetCreateInput = z.infer<typeof assetCreateSchema>;

export type AssetUpdateInput = z.infer<typeof assetUpdateSchema>;

export type AssignInput = z.infer<typeof assignSchema>;

export type ReturnInput = z.infer<typeof returnSchema>;

export type AssetListQuery = z.infer<typeof assetListSchema>;

export type TransferInput = z.infer<typeof transferSchema>;
