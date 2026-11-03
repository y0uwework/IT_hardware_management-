import { withApi } from "@/server/middleware/authenticate";
import { createPoFromQuotation } from "@/server/services/procurement.service";
import { poFromQuotationSchema } from "@/server/validators/procurement.validators";
import { created } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await createPoFromQuotation(user, parse(poFromQuotationSchema, req.body), correlationId), "Purchase order created"),
  },
});
