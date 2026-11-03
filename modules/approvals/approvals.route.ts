import { withApi } from "../../middlewares/authenticate";
import { actOnTask } from "./approvals.service";
import { ok } from "../../shared/api-response";
import { parse, parseId } from "../../shared/validation";
import type { ApprovalAction } from "./approvals.types";
import { approvalActionSchema } from "./approvals.validation";

const MESSAGES: Record<ApprovalAction, string> = {
  approve: "Request approved",
  reject: "Request rejected",
  return: "Request returned for changes",
};

/** Shared handler for the approve / reject / return endpoints. */
export function approvalActionRoute(action: ApprovalAction) {
  return withApi({
    POST: {
      permission: "request.approve",
      handler: async (req, res, { user, correlationId }) => {
        const { comments } = parse(approvalActionSchema, req.body ?? {});
        ok(res, await actOnTask(user, parseId(req.query.id), action, comments, correlationId), MESSAGES[action]);
      },
    },
  });
}
