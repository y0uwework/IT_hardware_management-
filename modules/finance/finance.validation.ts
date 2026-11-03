import { z } from "zod";
import { appConfig } from "../../shared/config/app.config";
import { id, listQuery, optDate, optText, price, qty, reqDate, taxRate } from "../../shared/validation";

export const fiscalYearSchema = z.string().regex(/^\d{4}(-\d{2})?$/, "Use a fiscal year like 2026-27");

export const budgetSchema = z.object({
  fiscalYear: fiscalYearSchema,
  department: z.string().trim().min(1, "Choose a department").max(100),
  costCentre: z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? ""), z.string().max(100)),
  amount: z.coerce.number({ invalid_type_error: "Enter an amount" }).nonnegative().max(100_000_000_000),
  notes: optText(1000),
});

export const invoiceSchema = z.object({
  purchaseOrderId: id("Choose a purchase order"),
  vendorInvoiceNumber: z.string().trim().min(1, "Enter the vendor's invoice number").max(100),
  invoiceDate: reqDate,
  dueDate: optDate,
  attachmentReference: optText(500),
  notes: optText(4000),
  lines: z
    .array(z.object({ purchaseOrderItemId: id(), quantity: qty, unitPrice: price, taxRate }))
    .min(1, "Invoice at least one line")
    .max(100),
});

export const verifySchema = z.object({
  comments: optText(2000),
  // Verify even though the 3-way match found differences (comments then required).
  acceptDiscrepancy: z.boolean().default(false),
});

export const paymentSchema = z.object({
  invoiceId: id("Choose an invoice"),
  paymentDate: reqDate,
  amount: z.coerce.number({ invalid_type_error: "Enter an amount" }).positive("Must be more than 0").max(100_000_000_000),
  tdsAmount: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().nonnegative().max(100_000_000_000)),
  paymentMode: z.enum(appConfig.paymentModes),
  paymentReference: z.string().trim().min(1, "Enter the UTR / cheque number").max(100),
  notes: optText(1000),
});

export const invoiceListSchema = listQuery.extend({
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const paymentListSchema = listQuery.extend({ from: optDate.optional(), to: optDate.optional() });
