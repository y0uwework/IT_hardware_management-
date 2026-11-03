import { withApi } from "@/server/middleware/authenticate";
import { rejectInvoice } from "@/server/services/finance.service";
import { reasonSchema } from "@/server/validators/procurement.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: ["finance.invoice.verify", "finance.invoice.approve"],
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await rejectInvoice(user, parseId(req.query.id), parse(reasonSchema, req.body).reason, correlationId), "Invoice rejected"),
  },
});
