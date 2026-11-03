import { withApi } from "@/server/middleware/authenticate";
import { verifyInvoice } from "@/server/services/finance.service";
import { verifySchema } from "@/server/validators/finance.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "finance.invoice.verify",
    handler: async (req, res, { user, correlationId }) => {
      const r = await verifyInvoice(user, parseId(req.query.id), parse(verifySchema, req.body), correlationId);
      ok(res, r, r.status === "Verified" ? "Invoice verified" : "Discrepancy recorded");
    },
  },
});
