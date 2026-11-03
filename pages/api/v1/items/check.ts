import { withApi } from "@/server/middleware/authenticate";
import { checkItemDuplicates } from "@/server/services/item.service";
import { itemCheckSchema } from "@/server/validators/item.validators";
import { ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  // Live "already exists" check for the add/edit form. Saving re-checks on the server.
  GET: {
    permission: ["item.create", "item.edit"],
    handler: async (req, res) => {
      const q = parse(itemCheckSchema, req.query);
      ok(res, await checkItemDuplicates(q.code, q.name, q.excludeId), "Duplicate check");
    },
  },
});
