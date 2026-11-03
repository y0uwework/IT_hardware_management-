import type { NextApiRequest } from "next";
import { z } from "zod";
import { withApi } from "@/server/middleware/authenticate";
import { requirePermission } from "@/server/middleware/authorize";
import {
  addTicketActivity,
  addTicketPart,
  assignTicket,
  closeTicket,
  progressTicket,
  reopenTicket,
  resolveTicket,
} from "@/server/services/maintenance.service";
import {
  activitySchema,
  assignSchema,
  closeSchema,
  partSchema,
  progressSchema,
  reopenSchema,
  resolveSchema,
} from "@/server/validators/maintenance.validators";
import { ok } from "@/lib/api-response";
import { parse, parseId } from "@/lib/validation";
import type { AuthUser } from "@/lib/auth";

const action = z.enum(["assign", "progress", "activity", "part", "resolve", "close", "reopen"]);
type Action = z.infer<typeof action>;

// Technician-only actions; close / reopen are also open to the reporter (checked in the service).
const TECH_ONLY: Action[] = ["assign", "progress", "activity", "part", "resolve"];

async function run(a: Action, user: AuthUser, id: number, req: NextApiRequest, cid: string) {
  switch (a) {
    case "assign": {
      const b = parse(assignSchema, req.body);
      return assignTicket(user, id, b.assigneeUserId, b.comments, cid);
    }
    case "progress":
      return progressTicket(user, id, parse(progressSchema, req.body), cid);
    case "activity":
      return addTicketActivity(user, id, parse(activitySchema, req.body), cid);
    case "part":
      return addTicketPart(user, id, parse(partSchema, req.body), cid);
    case "resolve":
      return resolveTicket(user, id, parse(resolveSchema, req.body), cid);
    case "close":
      return closeTicket(user, id, parse(closeSchema, req.body).comments, cid);
    case "reopen":
      return reopenTicket(user, id, parse(reopenSchema, req.body).reason, cid);
  }
}

export default withApi({
  POST: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user, correlationId }) => {
      const a = parse(action, req.query.action);
      if (TECH_ONLY.includes(a)) requirePermission(user, "maintenance.manage");
      ok(res, await run(a, user, parseId(req.query.id), req, correlationId), "Ticket updated");
    },
  },
});
