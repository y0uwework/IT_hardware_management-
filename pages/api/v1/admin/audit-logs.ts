import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listAuditLogs } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { paginationSchema, parse } from "@/lib/validation";

const schema = paginationSchema.extend({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
});

export default withApi({
  GET: {
    permission: "audit.view",
    handler: async (req, res) => {
      const q = parse(schema, req.query);
      const { items, total } = await listAuditLogs(q);
      ok(res, items, "Audit logs", { page: q.page, limit: q.limit, total });
    },
  },
});
