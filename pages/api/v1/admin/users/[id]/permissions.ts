import { withApi } from "@/server/middleware/authenticate";
import { setUserPermissions, userPermissionsSchema } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

// PUT { permissions: ["request.view", ...] } — stored on the user as permission IDs.
export default withApi({
  PUT: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { permissions } = parse(userPermissionsSchema, req.body);
      ok(res, await setUserPermissions(user, parseId(req.query.id), permissions, correlationId), "Permissions saved");
    },
  },
});
