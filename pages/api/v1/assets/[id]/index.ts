import { withApi } from "@/server/middleware/authenticate";
import { getAsset, updateAsset } from "@/server/services/asset.service";
import { assetUpdateSchema } from "@/server/validators/asset.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["asset.view", "asset.view.all"],
    handler: async (req, res, { user }) => ok(res, await getAsset(user, parseId(req.query.id)), "Asset"),
  },
  PUT: {
    permission: "asset.create",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await updateAsset(user, parseId(req.query.id), parse(assetUpdateSchema, req.body), correlationId), "Asset updated"),
  },
});
