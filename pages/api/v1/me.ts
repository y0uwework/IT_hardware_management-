import { withApi } from "@/server/middleware/authenticate";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: { handler: async (_req, res, { user }) => ok(res, user, "Current user") },
});
