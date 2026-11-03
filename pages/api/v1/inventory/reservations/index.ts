import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listReservations } from "@/server/services/inventory.service";
import { ok } from "@/lib/api-response";
import { paginationSchema, parse } from "@/lib/validation";

const schema = paginationSchema.extend({ status: z.string().max(20).optional() });

// Reservations are created through IT review (POST /hardware-requests/:id/it-review),
// which validates them against the request item.
export default withApi({
  GET: {
    permission: "inventory.view",
    handler: async (req, res) => {
      const q = parse(schema, req.query);
      const { items, total } = await listReservations(q);
      ok(res, items, "Reservations", { page: q.page, limit: q.limit, total });
    },
  },
});
