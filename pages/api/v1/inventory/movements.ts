import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listMovements, recordManualMovement } from "@/server/services/inventory.service";
import { created, ok } from "@/lib/api-response";
import { paginationSchema, parse } from "@/lib/validation";

const movementSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  warehouseId: z.coerce.number().int().positive(),
  movementType: z.enum(["Receipt", "Adjustment"]),
  quantity: z.coerce.number().int().min(-10_000).max(10_000),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

export default withApi({
  GET: {
    permission: "inventory.view",
    handler: async (req, res) => {
      const q = parse(paginationSchema, req.query);
      const { items, total } = await listMovements(q);
      ok(res, items, "Movements", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "inventory.manage",
    handler: async (req, res, { user, correlationId }) => {
      await recordManualMovement(user, parse(movementSchema, req.body), correlationId);
      created(res, null, "Stock movement recorded");
    },
  },
});
