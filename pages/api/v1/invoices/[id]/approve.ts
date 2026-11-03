import { withApi } from "@/server/middleware/authenticate";
import { approveInvoice } from "@/server/services/finance.service";
import { commentSchema } from "@/server/validators/procurement.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "finance.invoice.approve",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await approveInvoice(user, parseId(req.query.id), parse(commentSchema, req.body).comments, correlationId), "Invoice approved"),
  },
});
