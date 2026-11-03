import { z } from "zod";
import { blankToNull, id, listQuery, optDate, optInt, optText, price, qty, reqDate, taxRate } from "../../shared/validation";

// ── Vendors ──

export const vendorSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_\-/.]+$/, "Letters, digits, - _ / . only")),
  name: z.string().trim().min(2).max(200),
  gstin: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN")
      .nullable()
  ),
  pan: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN").nullable()),
  contactPerson: optText(150),
  email: z.preprocess(blankToNull, z.string().trim().email("Enter a valid email").max(255).nullable()),
  phone: optText(30),
  address: optText(500),
  city: optText(100),
  state: optText(100),
  pincode: z.preprocess(blankToNull, z.string().trim().regex(/^\d{6}$/, "6-digit PIN code").nullable()),
  paymentTermsDays: optInt(365),
  bankDetails: optText(500),
  notes: optText(1000),
  isActive: z.boolean().default(true),
});

// ── Requisitions ──

export const requisitionSchema = z
  .object({
    title: z.string().trim().min(3, "Give the requisition a title").max(200),
    department: optText(100),
    costCentre: optText(100),
    requiredDate: optDate,
    notes: optText(4000),
    // Request lines IT marked for procurement: buys the whole outstanding quantity of each.
    requestItemIds: z.array(id()).max(100).default([]),
    // Additional lines not tied to an employee request (e.g. buffer stock).
    lines: z
      .array(
        z.object({
          itemId: id("Choose an item"),
          quantity: qty,
          description: optText(1000),
          estimatedUnitPrice: z.preprocess(blankToNull, price.nullable()),
        })
      )
      .max(100)
      .default([]),
  })
  .refine((v) => v.requestItemIds.length + v.lines.length > 0, { message: "Add at least one line", path: ["lines"] });

// ── Quotations ──

export const quotationSchema = z.object({
  requisitionId: id(),
  vendorId: id("Choose a vendor"),
  vendorReference: optText(100),
  quoteDate: reqDate,
  validUntil: optDate,
  deliveryDays: optInt(3650),
  paymentTerms: optText(200),
  notes: optText(4000),
  lines: z
    .array(
      z.object({
        requisitionItemId: id(),
        quantity: qty,
        unitPrice: price,
        taxRate,
        remarks: optText(500),
      })
    )
    .min(1, "Quote at least one line")
    .max(100),
});

export const selectQuotationSchema = z.object({ reason: z.string().trim().min(3, "Say why this vendor was chosen").max(1000) });

// ── Purchase orders ──

export const poFromQuotationSchema = z.object({
  quotationId: id(),
  deliveryWarehouseId: id("Choose a delivery warehouse"),
  expectedDate: optDate,
  terms: optText(4000),
  notes: optText(4000),
});

export const poCreateSchema = z.object({
  vendorId: id("Choose a vendor"),
  deliveryWarehouseId: id("Choose a delivery warehouse"),
  orderDate: optDate,
  expectedDate: optDate,
  department: optText(100),
  costCentre: optText(100),
  terms: optText(4000),
  notes: optText(4000),
  lines: z
    .array(
      z.object({
        itemId: id("Choose an item"),
        description: optText(1000),
        quantity: qty,
        unitPrice: price,
        taxRate,
      })
    )
    .min(1, "Add at least one line")
    .max(100),
});

// ── Goods receipt ──

export const goodsReceiptSchema = z.object({
  purchaseOrderId: id(),
  warehouseId: z.preprocess(blankToNull, id().nullable()),
  receivedDate: reqDate,
  deliveryNote: optText(100),
  notes: optText(4000),
  lines: z
    .array(
      z.object({
        purchaseOrderItemId: id(),
        quantityReceived: z.coerce.number().int().min(0).max(100_000),
        quantityRejected: z.coerce.number().int().min(0).max(100_000).default(0),
        rejectionReason: optText(500),
        serialNumbers: optText(20_000),
      })
    )
    .min(1)
    .max(100),
});

export const poActionSchema = z.enum(["submit", "approve", "reject", "send", "cancel", "close"]);

export const poListSchema = listQuery.extend({
  vendorId: z.coerce.number().int().positive().optional(),
  receivable: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
