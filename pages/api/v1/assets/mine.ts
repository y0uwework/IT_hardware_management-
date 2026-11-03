import { withApi } from "@/server/middleware/authenticate";
import { myAssets } from "@/server/services/asset.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: { permission: "asset.view", handler: async (_req, res, { user }) => ok(res, await myAssets(user), "My assets") },
});
