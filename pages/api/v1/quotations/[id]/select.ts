import { withApi } from "@/server/middleware/authenticate";
import { selectQuotation } from "@/server/services/procurement.service";
import { selectQuotationSchema } from "@/server/validators/procurement.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await selectQuotation(user, parseId(req.query.id), parse(selectQuotationSchema, req.body).reason, correlationId), "Vendor selected"),
  },
});
