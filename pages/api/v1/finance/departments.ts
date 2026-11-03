import { withApi } from "@/server/middleware/authenticate";
import { listDepartments } from "@/server/services/finance.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: {
    permission: ["finance.budget.manage", "procurement.manage", "reports.view"],
    handler: async (_req, res) => ok(res, await listDepartments(), "Departments"),
  },
});
