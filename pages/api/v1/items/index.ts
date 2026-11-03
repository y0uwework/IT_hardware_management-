import { withApi } from "@/server/middleware/authenticate";
import { createItem, listItems } from "@/server/services/item.service";
import { itemInputSchema, itemListSchema } from "@/server/validators/item.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "item.view",
    handler: async (req, res) => {
      const q = parse(itemListSchema, req.query);
      const { items, total } = await listItems(q);
      ok(res, items, "Items", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "item.create",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createItem(user, parse(itemInputSchema, req.body), correlationId), "Item created"),
  },
});
