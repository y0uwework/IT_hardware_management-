import { withApi } from "@/server/middleware/authenticate";
import { returnAsset } from "@/server/services/asset.service";
import { returnSchema } from "@/server/validators/asset.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "asset.return",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await returnAsset(user, parseId(req.query.id), parse(returnSchema, req.body), correlationId), "Return processed"),
  },
});
