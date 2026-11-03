import { withApi } from "@/server/middleware/authenticate";
import { deleteItem, updateItem } from "@/server/services/item.service";
import { itemInputSchema } from "@/server/validators/item.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  PUT: {
    permission: "item.edit",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await updateItem(user, parseId(req.query.id), parse(itemInputSchema, req.body), correlationId), "Item updated"),
  },
  // Soft delete.
  DELETE: {
    permission: "item.delete",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await deleteItem(user, parseId(req.query.id), correlationId), "Item deleted"),
  },
});
