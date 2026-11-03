import { withApi } from "@/server/middleware/authenticate";
import { listWorkflows, saveWorkflowVersion, workflowSchema } from "@/server/services/admin.service";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: { permission: "admin.workflow.manage", handler: async (_req, res) => ok(res, await listWorkflows(), "Workflows") },
  POST: {
    permission: "admin.workflow.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await saveWorkflowVersion(user, parse(workflowSchema, req.body), correlationId), "Workflow version saved"),
  },
});
