// procurement module — types.
import type { z } from "zod";
import type { goodsReceiptSchema, poCreateSchema, quotationSchema, requisitionSchema, vendorSchema } from "./procurement.validation";

export type PoAction = "submit" | "approve" | "reject" | "send" | "cancel" | "close";

export type VendorInput = z.infer<typeof vendorSchema>;

export type RequisitionInput = z.infer<typeof requisitionSchema>;

export type QuotationInput = z.infer<typeof quotationSchema>;

export type PoCreateInput = z.infer<typeof poCreateSchema>;

export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;
