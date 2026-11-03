import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { runReport } from "@/server/services/reports.service";
import { ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

const date = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional());
const schema = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{2,60}$/),
    from: date,
    to: date,
    department: z.string().trim().max(100).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "From must be on or before To", path: ["to"] });

export default withApi({
  GET: {
    permission: "reports.view",
    handler: async (req, res, { user }) => {
      const q = parse(schema, req.query);
      const from = q.from ? new Date(`${q.from}T00:00:00Z`) : null;
      const toExclusive = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) : null;
      ok(res, await runReport(user, q.key, { from, toExclusive, department: q.department || null }), "Report");
    },
  },
});
