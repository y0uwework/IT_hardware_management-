import { withApi } from "@/server/middleware/authenticate";
import { acknowledgeAssignment } from "@/server/services/asset.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "asset.view",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await acknowledgeAssignment(user, parseId(req.query.id), correlationId), "Receipt acknowledged"),
  },
});
