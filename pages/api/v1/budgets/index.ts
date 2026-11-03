import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listBudgets, saveBudget } from "@/server/services/finance.service";
import { budgetSchema, fiscalYearSchema } from "@/server/validators/finance.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";
import { fiscalYearOf } from "@/config/app.config";

export default withApi({
  GET: {
    permission: "finance.budget.manage",
    handler: async (req, res) => {
      const { fiscalYear } = parse(z.object({ fiscalYear: fiscalYearSchema.default(fiscalYearOf(new Date())) }), req.query);
      ok(res, await listBudgets(fiscalYear), "Budgets");
    },
  },
  POST: {
    permission: "finance.budget.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await saveBudget(user, null, parse(budgetSchema, req.body), correlationId), "Budget saved"),
  },
});
