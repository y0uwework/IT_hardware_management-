import { withApi } from "@/server/middleware/authenticate";
import { getPurchaseOrder } from "@/server/services/procurement.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["procurement.manage", "procurement.po.approve", "procurement.receive", "finance.invoice.verify", "finance.invoice.approve"],
    handler: async (req, res) => ok(res, await getPurchaseOrder(parseId(req.query.id)), "Purchase order"),
  },
});
