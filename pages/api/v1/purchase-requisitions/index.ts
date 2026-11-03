import { withApi } from "@/server/middleware/authenticate";
import { createRequisition, listRequisitions } from "@/server/services/procurement.service";
import { listQuery, requisitionSchema } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "procurement.manage",
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listRequisitions(q);
      ok(res, items, "Requisitions", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createRequisition(user, parse(requisitionSchema, req.body), correlationId), "Requisition created"),
  },
});
