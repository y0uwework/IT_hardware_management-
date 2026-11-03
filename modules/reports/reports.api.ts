// reports module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { listReports, runReport } from "./reports.service";
import { ok } from "../../shared/api-response";
import { parse } from "../../shared/validation";
import { reportRunSchema } from "./reports.validation";

// /api/v1/reports/[key]
export const reportsByKeyHandler = withApi({
  GET: {
    permission: "reports.view",
    handler: async (req, res, { user }) => {
      const q = parse(reportRunSchema, req.query);
      const from = q.from ? new Date(`${q.from}T00:00:00Z`) : null;
      const toExclusive = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) : null;
      ok(res, await runReport(user, q.key, { from, toExclusive, department: q.department || null }), "Report");
    },
  },
});

// /api/v1/reports
export const reportsHandler = withApi({
  GET: { permission: "reports.view", handler: async (_req, res, { user }) => ok(res, listReports(user), "Reports") },
});
