import { withApi } from "@/server/middleware/authenticate";
import { getRequisition } from "@/server/services/procurement.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  GET: { permission: "procurement.manage", handler: async (req, res) => ok(res, await getRequisition(parseId(req.query.id)), "Requisition") },
});
