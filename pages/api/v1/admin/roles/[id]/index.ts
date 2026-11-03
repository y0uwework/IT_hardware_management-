import { withApi } from "@/server/middleware/authenticate";
import { roleSchema, updateRole } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  PUT: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await updateRole(user, parseId(req.query.id), parse(roleSchema.partial(), req.body), correlationId), "Role updated"),
  },
});
