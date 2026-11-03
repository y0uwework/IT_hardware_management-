import { withApi } from "@/server/middleware/authenticate";
import { invoiceDraft } from "@/server/services/finance.service";
import { ok } from "@/lib/api-response";
import { parseId } from "@/lib/validation";

export default withApi({
  // Pre-fill for a new invoice: accepted-but-uninvoiced quantities at PO prices.
  GET: {
    permission: "finance.invoice.verify",
    handler: async (req, res) => ok(res, await invoiceDraft(parseId(req.query.purchaseOrderId, "purchase order")), "Invoice draft"),
  },
});
