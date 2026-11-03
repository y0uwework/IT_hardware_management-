import { withApi } from "@/server/middleware/authenticate";
import { saveItReview } from "@/server/services/request.service";
import { itReviewSchema } from "@/server/validators/request.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  POST: {
    permission: "request.it_review",
    handler: async (req, res, { user, correlationId }) => {
      const input = parse(itReviewSchema, req.body);
      ok(res, await saveItReview(user, parseId(req.query.id), input, correlationId), "IT review saved");
    },
  },
});
