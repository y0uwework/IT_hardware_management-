// approvals module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { approvalActionRoute } from "./approvals.route";
import { getTask, listMyTasks } from "./approvals.service";
import { ok } from "../../shared/api-response";
import { paginationSchema, parse, parseId } from "../../shared/validation";
import { approvalListSchema } from "./approvals.validation";

// /api/v1/approvals/[id]/approve
export const approvalsByIdApproveHandler = approvalActionRoute("approve");

// /api/v1/approvals/[id]
export const approvalsByIdHandler = withApi({
  GET: {
    permission: "request.approve",
    handler: async (req, res, { user }) => ok(res, await getTask(user, parseId(req.query.id)), "Approval task"),
  },
});

// /api/v1/approvals/[id]/reject
export const approvalsByIdRejectHandler = approvalActionRoute("reject");

// /api/v1/approvals/[id]/return
export const approvalsByIdReturnHandler = approvalActionRoute("return");

// /api/v1/approvals
export const approvalsHandler = withApi({
  GET: {
    permission: "request.approve",
    handler: async (req, res, { user }) => {
      const q = parse(approvalListSchema, req.query);
      const { items, total } = await listMyTasks(user, q);
      ok(res, items, "Approval tasks", { page: q.page, limit: q.limit, total });
    },
  },
});
