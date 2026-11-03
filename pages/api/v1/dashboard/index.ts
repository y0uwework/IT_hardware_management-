import { withApi } from "@/server/middleware/authenticate";
import { getDashboard } from "@/server/services/dashboard.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: { permission: "dashboard.view", handler: async (_req, res, { user }) => ok(res, await getDashboard(user)) },
});
