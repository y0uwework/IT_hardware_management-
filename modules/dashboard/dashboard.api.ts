// dashboard module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { getDashboard } from "./dashboard.service";
import { ok } from "../../shared/api-response";

// /api/v1/dashboard
export const dashboardHandler = withApi({
  GET: { permission: "dashboard.view", handler: async (_req, res, { user }) => ok(res, await getDashboard(user)) },
});
