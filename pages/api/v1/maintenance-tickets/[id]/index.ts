import { withApi } from "@/server/middleware/authenticate";
import { getTicket } from "@/server/services/maintenance.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  // Reporters see their own tickets; the service enforces that.
  GET: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user }) => ok(res, await getTicket(user, parseId(req.query.id)), "Ticket"),
  },
});
