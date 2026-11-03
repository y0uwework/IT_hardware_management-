import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { setWorkflowActive } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

const schema = z.object({ isActive: z.boolean() });

export default withApi({
  POST: {
    permission: "admin.workflow.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { isActive } = parse(schema, req.body);
      await setWorkflowActive(user, parseId(req.query.id), isActive, correlationId);
      ok(res, null, isActive ? "Workflow activated" : "Workflow deactivated");
    },
  },
});
