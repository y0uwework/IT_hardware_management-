import { withApi } from "@/server/middleware/authenticate";
import { listReports } from "@/server/services/reports.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: { permission: "reports.view", handler: async (_req, res, { user }) => ok(res, listReports(user), "Reports") },
});
