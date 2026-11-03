import { withApi } from "@/server/middleware/authenticate";
import { listRoles } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";

// Roles are defined in config/roles.config.ts — read only.
export default withApi({
  GET: {
    permission: ["admin.roles.manage", "admin.workflow.manage"],
    handler: async (_req, res) => ok(res, listRoles(), "Roles"),
  },
});
