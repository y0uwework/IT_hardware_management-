import { withApi } from "@/server/middleware/authenticate";
import { setUserRole, userRoleSchema } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

// PUT { role: "IT_ADMIN" | null, applyDefaults?: boolean }
export default withApi({
  PUT: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await setUserRole(user, parseId(req.query.id), parse(userRoleSchema, req.body), correlationId), "Role updated"),
  },
});
