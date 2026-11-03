import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { actOnPurchaseOrder } from "@/server/services/procurement.service";
import { commentSchema } from "@/server/validators/procurement.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

const action = z.enum(["submit", "approve", "reject", "send", "cancel", "close"]);

export default withApi({
  // Finer checks (which permission per action, approver ≠ creator) live in the service.
  POST: {
    permission: ["procurement.manage", "procurement.po.approve"],
    handler: async (req, res, { user, correlationId }) => {
      const a = parse(action, req.query.action);
      const { comments } = parse(commentSchema, req.body);
      ok(res, await actOnPurchaseOrder(user, parseId(req.query.id), a, comments, correlationId), "Purchase order updated");
    },
  },
});
