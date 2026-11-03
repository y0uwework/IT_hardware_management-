import { withApi } from "@/server/middleware/authenticate";
import { saveVendor } from "@/server/services/procurement.service";
import { vendorSchema } from "@/server/validators/procurement.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  PUT: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await saveVendor(user, parseId(req.query.id), parse(vendorSchema, req.body), correlationId), "Vendor updated"),
  },
});
