import { withApi } from "@/server/middleware/authenticate";
import { vendorOptions } from "@/server/services/procurement.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: {
    permission: ["procurement.manage", "finance.invoice.verify", "maintenance.manage", "reports.view"],
    handler: async (_req, res) => ok(res, await vendorOptions(), "Vendor options"),
  },
});
