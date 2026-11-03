import { withApi } from "@/server/middleware/authenticate";
import { pendingProcurementLines } from "@/server/services/procurement.service";
import { ok } from "@/lib/api-response";

export default withApi({
  // Request lines IT marked "to procure" that are not yet on a requisition.
  GET: { permission: "procurement.manage", handler: async (_req, res) => ok(res, await pendingProcurementLines(), "Pending lines") },
});
