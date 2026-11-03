import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { createInvoice, listInvoices } from "@/server/services/finance.service";
import { invoiceSchema } from "@/server/validators/finance.validators";
import { listQuery } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

const invoiceList = listQuery.extend({
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export default withApi({
  GET: {
    permission: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
    handler: async (req, res) => {
      const q = parse(invoiceList, req.query);
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
