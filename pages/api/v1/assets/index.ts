import { withApi } from "@/server/middleware/authenticate";
import { listAssets, registerAsset } from "@/server/services/asset.service";
import { assetCreateSchema, assetListSchema } from "@/server/validators/asset.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["asset.view.all", "asset.assign", "request.it_review"],
    handler: async (req, res) => {
      const q = parse(assetListSchema, req.query);
      const { items, total } = await listAssets(q);
      ok(res, items, "Assets", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "asset.create",
    handler: async (req, res, { user, correlationId }) => {
      created(res, await registerAsset(user, parse(assetCreateSchema, req.body), correlationId), "Asset registered");
    },
  },
});
