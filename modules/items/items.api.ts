// items module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { bulkCreateItems, checkItemDuplicates, createItem, deleteItem, listItemOptions, listItems, updateItem } from "./items.service";
import { itemBulkSchema, itemCheckSchema, itemInputSchema, itemListSchema } from "./items.validation";
import { created, ok } from "../../shared/api-response";
import { parse, parseId } from "../../shared/validation";

// /api/v1/items/[id]
export const itemsByIdHandler = withApi({
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

// /api/v1/items/bulk
// Up to appConfig.itemBulkUploadMaxRows rows of parsed CSV.

// /api/v1/items/bulk
export const itemsBulkHandler = withApi({
  POST: {
    permission: "item.bulk_upload",
    handler: async (req, res, { user, correlationId }) => {
      const { rows } = parse(itemBulkSchema, req.body);
      const result = await bulkCreateItems(user, rows, correlationId);
      ok(res, result, `${result.created} item(s) created, ${result.exists} already existed, ${result.failed} failed`);
    },
  },
});

// /api/v1/items/check
export const itemsCheckHandler = withApi({
  // Live "already exists" check for the add/edit form. Saving re-checks on the server.
  GET: {
    permission: ["item.create", "item.edit"],
    handler: async (req, res) => {
      const q = parse(itemCheckSchema, req.query);
      ok(res, await checkItemDuplicates(q.code, q.name, q.excludeId), "Duplicate check");
    },
  },
});

// /api/v1/items
export const itemsHandler = withApi({
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

// /api/v1/items/options
export const itemsOptionsHandler = withApi({
  // Pick list of active items: anyone building a request needs it.
  GET: {
    permission: ["request.create", "item.view"],
    handler: async (_req, res) => ok(res, await listItemOptions(), "Item options"),
  },
});
