import type { z } from "zod";
import type { itemInputSchema, itemListSchema } from "./items.validation";
export interface ItemRow {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  itemType: string;
  manufacturer: string | null;
  model: string | null;
  partNumber: string | null;
  description: string | null;
  unitOfMeasure: string;
  hsnCode: string | null;
  standardCost: string | null;
  warrantyMonths: number | null;
  reorderLevel: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: number; code: string; name: string };
}

export interface CategoryOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export type ItemInput = z.infer<typeof itemInputSchema>;

export type ItemListQuery = z.infer<typeof itemListSchema>;

export type BulkRowStatus = "created" | "exists" | "error";

export interface BulkRowResult {
  row: number; // spreadsheet row number (header is row 1)
  code: string;
  name: string;
  status: BulkRowStatus;
  messages: string[];
}
