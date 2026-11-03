import { withApi } from "@/server/middleware/authenticate";
import { listPermissionCatalogue } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";

export default withApi({
  GET: { permission: "admin.roles.manage", handler: async (_req, res) => ok(res, await listPermissionCatalogue(), "Permissions") },
});
