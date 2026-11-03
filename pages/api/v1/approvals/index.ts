import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listMyTasks } from "@/server/services/approval.service";
import { ok } from "@/lib/api-response";
import { paginationSchema, parse } from "@/lib/validation";

const schema = paginationSchema.extend({ status: z.string().max(30).optional() });

export default withApi({
  GET: {
    permission: "request.approve",
    handler: async (req, res, { user }) => {
      const q = parse(schema, req.query);
      const { items, total } = await listMyTasks(user, q);
      ok(res, items, "Approval tasks", { page: q.page, limit: q.limit, total });
    },
  },
});
