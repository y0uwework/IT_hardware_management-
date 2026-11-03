import { withApi } from "@/server/middleware/authenticate";
import { listWarehouses, upsertWarehouse, warehouseSchema } from "@/server/services/admin.service";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["inventory.view", "asset.create", "asset.return", "request.it_review", "admin.master_data.manage"],
    handler: async (req, res, { user }) => {
      const all = req.query.all === "true" && user.permissions.includes("admin.master_data.manage");
      ok(res, await listWarehouses(!all), "Warehouses");
    },
  },
  POST: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await upsertWarehouse(user, null, parse(warehouseSchema, req.body), correlationId), "Warehouse created"),
  },
});
