import { withApi } from "@/server/middleware/authenticate";
import { categorySchema, listCategories, upsertCategory } from "@/server/services/admin.service";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  // Any signed-in user needs categories to build a request.
  GET: {
    handler: async (req, res, { user }) => {
      const all = req.query.all === "true" && user.permissions.includes("admin.master_data.manage");
      ok(res, await listCategories(!all), "Categories");
    },
  },
  POST: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await upsertCategory(user, null, parse(categorySchema, req.body), correlationId), "Category created"),
  },
});
