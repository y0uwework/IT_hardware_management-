import { withApi } from "@/server/middleware/authenticate";
import { listVendors, saveVendor } from "@/server/services/procurement.service";
import { listQuery, vendorSchema } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: "procurement.manage",
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listVendors(q);
      ok(res, items, "Vendors", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await saveVendor(user, null, parse(vendorSchema, req.body), correlationId), "Vendor created"),
  },
});
