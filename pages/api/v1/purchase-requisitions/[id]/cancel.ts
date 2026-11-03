import { withApi } from "@/server/middleware/authenticate";
import { cancelRequisition } from "@/server/services/procurement.service";
import { reasonSchema } from "@/server/validators/procurement.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "procurement.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await cancelRequisition(user, parseId(req.query.id), parse(reasonSchema, req.body).reason, correlationId), "Requisition cancelled"),
  },
});
