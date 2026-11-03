// maintenance module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import type { NextApiRequest } from "next";
import { withApi } from "../../middlewares/authenticate";
import { requirePermission } from "../../middlewares/authorize";
import { addTicketActivity, addTicketPart, assignTicket, closeTicket, createTicket, getTicket, listTechnicians, listTickets, progressTicket, reopenTicket, resolveTicket } from "./maintenance.service";
import { activitySchema, assignSchema, closeSchema, partSchema, progressSchema, reopenSchema, resolveSchema, ticketActionSchema, ticketCreateSchema, ticketListSchema } from "./maintenance.validation";
import { created, ok } from "../../shared/api-response";
import type { AuthUser } from "../../shared/auth";
import { parse, parseId } from "../../shared/validation";
import type { TicketAction } from "./maintenance.types";

// Technician-only actions; close / reopen are also open to the reporter (checked in the service).
const TECH_ONLY: TicketAction[] = ["assign", "progress", "activity", "part", "resolve"];

async function run(a: TicketAction, user: AuthUser, id: number, req: NextApiRequest, cid: string) {
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

// /api/v1/maintenance-tickets/[id]/[action]
export const maintenanceTicketsByIdActionHandler = withApi({
  POST: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user, correlationId }) => {
      const a = parse(ticketActionSchema, req.query.action);
      if (TECH_ONLY.includes(a)) requirePermission(user, "maintenance.manage");
      ok(res, await run(a, user, parseId(req.query.id), req, correlationId), "Ticket updated");
    },
  },
});

// /api/v1/maintenance-tickets/[id]
export const maintenanceTicketsByIdHandler = withApi({
  // Reporters see their own tickets; the service enforces that.
  GET: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user }) => ok(res, await getTicket(user, parseId(req.query.id)), "Ticket"),
  },
});

// /api/v1/maintenance-tickets
export const maintenanceTicketsHandler = withApi({
  GET: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user }) => {
      const q = parse(ticketListSchema, req.query);
      const { items, total } = await listTickets(user, q);
      ok(res, items, "Tickets", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: ["maintenance.report", "maintenance.manage"],
    handler: async (req, res, { user, correlationId }) => {
      const r = await createTicket(user, parse(ticketCreateSchema, req.body), correlationId);
      created(res, r, `${r.ticketNumber} raised${r.isRepeat ? " (repeat issue on this asset)" : ""}`);
    },
  },
});

// /api/v1/maintenance-tickets/technicians
export const maintenanceTicketsTechniciansHandler = withApi({
  GET: { permission: "maintenance.manage", handler: async (_req, res) => ok(res, await listTechnicians(), "Technicians") },
});
