import { withApi } from "@/server/middleware/authenticate";
import { createQuotation, listQuotations } from "@/server/services/procurement.service";
import { listQuery, quotationSchema } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "procurement.manage",
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listQuotations(q);
      ok(res, items, "Quotations", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createQuotation(user, parse(quotationSchema, req.body), correlationId), "Quotation recorded"),
  },
});
