import { withApi } from "@/server/middleware/authenticate";
import { getTask } from "@/server/services/approval.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "request.approve",
    handler: async (req, res, { user }) => ok(res, await getTask(user, parseId(req.query.id)), "Approval task"),
  },
});
