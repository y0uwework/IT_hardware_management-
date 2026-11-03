import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { listPayments, recordPayment } from "@/server/services/finance.service";
import { paymentSchema } from "@/server/validators/finance.validators";
import { listQuery, optDate } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

const paymentList = listQuery.extend({ from: optDate.optional(), to: optDate.optional() });

export default withApi({
  GET: {
    permission: ["finance.payment.manage", "finance.invoice.approve"],
    handler: async (req, res) => {
      const q = parse(paymentList, req.query);
      const { items, total, sum } = await listPayments({ ...q, from: q.from ?? undefined, to: q.to ?? undefined });
      ok(res, { items, sum }, "Payments", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "finance.payment.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await recordPayment(user, parse(paymentSchema, req.body), correlationId), "Payment recorded"),
  },
});
