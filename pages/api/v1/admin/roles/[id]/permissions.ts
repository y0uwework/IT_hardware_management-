import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { setRolePermissions } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

const schema = z.object({ permissions: z.array(z.string().max(100)).max(500) });

export default withApi({
  PUT: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { permissions } = parse(schema, req.body);
      ok(res, await setRolePermissions(user, parseId(req.query.id), permissions, correlationId), "Role permissions saved");
    },
  },
});
