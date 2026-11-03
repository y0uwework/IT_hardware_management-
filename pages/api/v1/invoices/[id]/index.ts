import { withApi } from "@/server/middleware/authenticate";
import { getInvoice } from "@/server/services/finance.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
    handler: async (req, res) => ok(res, await getInvoice(parseId(req.query.id)), "Invoice"),
  },
});
