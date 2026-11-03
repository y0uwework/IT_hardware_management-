import { withApi } from "@/server/middleware/authenticate";
import { assignAsset } from "@/server/services/asset.service";
import { assignSchema } from "@/server/validators/asset.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "asset.assign",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await assignAsset(user, parseId(req.query.id), parse(assignSchema, req.body), correlationId), "Asset assigned"),
  },
});
