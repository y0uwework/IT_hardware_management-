import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { createPo, listPurchaseOrders } from "@/server/services/procurement.service";
import { listQuery, poCreateSchema } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

const poList = listQuery.extend({
  vendorId: z.coerce.number().int().positive().optional(),
  receivable: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export default withApi({
  GET: {
    permission: ["procurement.manage", "procurement.po.approve", "procurement.receive", "finance.invoice.verify"],
    handler: async (req, res) => {
      const q = parse(poList, req.query);
      const { items, total } = await listPurchaseOrders(q);
      ok(res, items, "Purchase orders", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createPo(user, parse(poCreateSchema, req.body), correlationId), "Purchase order created"),
  },
});
