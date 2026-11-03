import { withApi } from "@/server/middleware/authenticate";
import { upsertWarehouse, warehouseSchema } from "@/server/services/admin.service";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  PUT: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await upsertWarehouse(user, parseId(req.query.id), parse(warehouseSchema, req.body), correlationId), "Warehouse updated"),
  },
});
