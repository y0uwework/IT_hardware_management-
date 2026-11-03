// finance module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { z } from "zod";
import { withApi } from "../../middlewares/authenticate";
import { approveInvoice, createInvoice, getInvoice, invoiceDraft, listBudgets, listDepartments, listInvoices, listPayments, recordPayment, rejectInvoice, saveBudget, verifyInvoice } from "./finance.service";
import { budgetSchema, fiscalYearSchema, invoiceListSchema, invoiceSchema, paymentListSchema, paymentSchema, verifySchema } from "./finance.validation";
import { created, ok } from "../../shared/api-response";
import { fiscalYearOf } from "../../shared/config/app.config";
import { commentSchema, listQuery, optDate, parse, parseId, reasonSchema } from "../../shared/validation";

// /api/v1/budgets/[id]
export const budgetsByIdHandler = withApi({
  PUT: {
    permission: "finance.budget.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await saveBudget(user, parseId(req.query.id), parse(budgetSchema, req.body), correlationId), "Budget updated"),
  },
});

// /api/v1/budgets
export const budgetsHandler = withApi({
  GET: {
    permission: "finance.budget.manage",
    handler: async (req, res) => {
      const { fiscalYear } = parse(z.object({ fiscalYear: fiscalYearSchema.default(fiscalYearOf(new Date())) }), req.query);
      ok(res, await listBudgets(fiscalYear), "Budgets");
    },
  },
  POST: {
    permission: "finance.budget.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await saveBudget(user, null, parse(budgetSchema, req.body), correlationId), "Budget saved"),
  },
});

// /api/v1/finance/departments
export const financeDepartmentsHandler = withApi({
  GET: {
    permission: ["finance.budget.manage", "procurement.manage", "reports.view"],
    handler: async (_req, res) => ok(res, await listDepartments(), "Departments"),
  },
});

// /api/v1/invoices/[id]/approve
export const invoicesByIdApproveHandler = withApi({
  POST: {
    permission: "finance.invoice.approve",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await approveInvoice(user, parseId(req.query.id), parse(commentSchema, req.body).comments, correlationId), "Invoice approved"),
  },
});

// /api/v1/invoices/[id]
export const invoicesByIdHandler = withApi({
  GET: {
    permission: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
    handler: async (req, res) => ok(res, await getInvoice(parseId(req.query.id)), "Invoice"),
  },
});

// /api/v1/invoices/[id]/reject
export const invoicesByIdRejectHandler = withApi({
  POST: {
    permission: ["finance.invoice.verify", "finance.invoice.approve"],
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await rejectInvoice(user, parseId(req.query.id), parse(reasonSchema, req.body).reason, correlationId), "Invoice rejected"),
  },
});

// /api/v1/invoices/[id]/verify
export const invoicesByIdVerifyHandler = withApi({
  POST: {
    permission: "finance.invoice.verify",
    handler: async (req, res, { user, correlationId }) => {
      const r = await verifyInvoice(user, parseId(req.query.id), parse(verifySchema, req.body), correlationId);
      ok(res, r, r.status === "Verified" ? "Invoice verified" : "Discrepancy recorded");
    },
  },
});

// /api/v1/invoices/draft
export const invoicesDraftHandler = withApi({
  // Pre-fill for a new invoice: accepted-but-uninvoiced quantities at PO prices.
  GET: {
    permission: "finance.invoice.verify",
    handler: async (req, res) => ok(res, await invoiceDraft(parseId(req.query.purchaseOrderId, "purchase order")), "Invoice draft"),
  },
});

// /api/v1/invoices
export const invoicesHandler = withApi({
  GET: {
    permission: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
    handler: async (req, res) => {
      const q = parse(invoiceListSchema, req.query);
      const { items, total } = await listInvoices(q);
      ok(res, items, "Invoices", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "finance.invoice.verify",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createInvoice(user, parse(invoiceSchema, req.body), correlationId), "Invoice entered"),
  },
});

// /api/v1/payments
export const paymentsHandler = withApi({
  GET: {
    permission: ["finance.payment.manage", "finance.invoice.approve"],
    handler: async (req, res) => {
      const q = parse(paymentListSchema, req.query);
      const { items, total, sum } = await listPayments({ ...q, from: q.from ?? undefined, to: q.to ?? undefined });
      ok(res, { items, sum }, "Payments", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "finance.payment.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await recordPayment(user, parse(paymentSchema, req.body), correlationId), "Payment recorded"),
  },
});
