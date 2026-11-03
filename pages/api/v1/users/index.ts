import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { searchUsers } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { paginationSchema, parse } from "@/lib/validation";

const schema = paginationSchema.extend({ activeOnly: z.enum(["true", "false"]).optional() });

export default withApi({
  GET: {
    permission: ["employee.view", "asset.assign", "admin.roles.manage"],
    handler: async (req, res) => {
      const q = parse(schema, req.query);
      const { items, total } = await searchUsers({ ...q, activeOnly: q.activeOnly === "true" });
      ok(res, items, "Users", { page: q.page, limit: q.limit, total });
    },
  },
});
