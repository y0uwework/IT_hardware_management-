import { withApi } from "@/server/middleware/authenticate";
import { createRole, listRoles, roleSchema } from "@/server/services/admin.service";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["admin.roles.manage", "admin.workflow.manage"],
    handler: async (_req, res) => ok(res, await listRoles(), "Roles"),
  },
  POST: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createRole(user, parse(roleSchema, req.body), correlationId), "Role created"),
  },
});
