import { withApi } from "@/server/middleware/authenticate";
import { categorySchema, upsertCategory } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  PUT: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await upsertCategory(user, parseId(req.query.id), parse(categorySchema, req.body), correlationId), "Category updated"),
  },
});
