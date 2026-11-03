import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { assignRole, removeRole } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

const schema = z.object({ roleId: z.coerce.number().int().positive() });

export default withApi({
  POST: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { roleId } = parse(schema, req.body);
      await assignRole(user, parseId(req.query.id), roleId, correlationId);
      ok(res, null, "Role assigned");
    },
  },
  DELETE: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { roleId } = parse(schema, req.body);
      await removeRole(user, parseId(req.query.id), roleId, correlationId);
      ok(res, null, "Role removed");
    },
  },
});
