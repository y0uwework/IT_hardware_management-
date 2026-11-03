import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listStock } from "@/server/services/inventory.service";
import { ok } from "@/lib/api-response";
import { paginationSchema, parse } from "@/lib/validation";

const schema = paginationSchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
});

export default withApi({
  GET: {
    permission: "inventory.view",
    handler: async (req, res) => {
      const q = parse(schema, req.query);
      const { items, total } = await listStock(q);
      ok(res, items, "Inventory", { page: q.page, limit: q.limit, total });
    },
  },
});
