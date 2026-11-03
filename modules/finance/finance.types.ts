// finance module — types.
import type { z } from "zod";
import type { budgetSchema, invoiceSchema, paymentSchema } from "./finance.validation";

export type BudgetInput = z.infer<typeof budgetSchema>;

export type InvoiceInput = z.infer<typeof invoiceSchema>;

export type PaymentInput = z.infer<typeof paymentSchema>;
