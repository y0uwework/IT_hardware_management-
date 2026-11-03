import { withApi } from "@/server/middleware/authenticate";
import { saveBudget } from "@/server/services/finance.service";
import { budgetSchema } from "@/server/validators/finance.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";

export default withApi({
  PUT: {
    permission: "finance.budget.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await saveBudget(user, parseId(req.query.id), parse(budgetSchema, req.body), correlationId), "Budget updated"),
  },
});
