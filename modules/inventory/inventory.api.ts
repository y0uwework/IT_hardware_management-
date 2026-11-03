// inventory module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { availability, issueConsumableReservation, listMovements, listReservations, listStock, recordManualMovement, releaseReservation } from "./inventory.service";
import { recomputeFulfilment } from "../requests/requests.service";
import { created, ok } from "../../shared/api-response";
import { queryOne, withTransaction } from "../../shared/db";
import { notFound } from "../../shared/errors";
import { paginationSchema, parse, parseId } from "../../shared/validation";
import { movementSchema, releaseReservationSchema, reservationListSchema, stockListSchema } from "./inventory.validation";

// /api/v1/inventory/availability
export const inventoryAvailabilityHandler = withApi({
  GET: {
    permission: ["inventory.view", "request.it_review"],
    handler: async (req, res) => ok(res, await availability(parseId(req.query.categoryId, "categoryId")), "Availability"),
  },
});

// /api/v1/inventory
export const inventoryHandler = withApi({
  GET: {
    permission: "inventory.view",
    handler: async (req, res) => {
      const q = parse(stockListSchema, req.query);
      const { items, total } = await listStock(q);
      ok(res, items, "Inventory", { page: q.page, limit: q.limit, total });
    },
  },
});

// /api/v1/inventory/movements
export const inventoryMovementsHandler = withApi({
  GET: {
    permission: "inventory.view",
    handler: async (req, res) => {
      const q = parse(paginationSchema, req.query);
      const { items, total } = await listMovements(q);
      ok(res, items, "Movements", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "inventory.manage",
    handler: async (req, res, { user, correlationId }) => {
      await recordManualMovement(user, parse(movementSchema, req.body), correlationId);
      created(res, null, "Stock movement recorded");
    },
  },
});

// /api/v1/inventory/reservations/[id]/issue
export const inventoryReservationsByIdIssueHandler = withApi({
  POST: {
    permission: "asset.assign",
    handler: async (req, res, { user, correlationId }) => {
      const id = parseId(req.query.id);
      await withTransaction(async (tx) => {
        const r = await issueConsumableReservation(tx, user, id, correlationId);
        const item = await queryOne<{ hardwareRequestId: number }>(
          tx,
          `SELECT hardware_request_id AS hardwareRequestId FROM dbo.hardware_request_items WHERE id = @id`,
          { id: r.requestItemId }
        );
        if (!item) throw notFound("Request item");
        await recomputeFulfilment(tx, item.hardwareRequestId, user.id);
      });
      ok(res, null, "Stock issued");
    },
  },
});

// /api/v1/inventory/reservations/[id]/release
export const inventoryReservationsByIdReleaseHandler = withApi({
  POST: {
    permission: ["inventory.manage", "request.it_review"],
    handler: async (req, res, { user, correlationId }) => {
      const { reason } = parse(releaseReservationSchema, req.body);
      const id = parseId(req.query.id);
      await withTransaction(async (tx) => {
        const r = await releaseReservation(tx, user, id, reason, correlationId);
        const item = await queryOne<{ hardwareRequestId: number }>(
          tx,
          `SELECT hardware_request_id AS hardwareRequestId FROM dbo.hardware_request_items WHERE id = @id`,
          { id: r.requestItemId }
        );
        if (!item) throw notFound("Request item");
        await recomputeFulfilment(tx, item.hardwareRequestId, user.id);
      });
      ok(res, null, "Reservation released");
    },
  },
});

// /api/v1/inventory/reservations
// Reservations are created through IT review (POST /hardware-requests/:id/it-review),
// which validates them against the request item.
export const inventoryReservationsHandler = withApi({
  GET: {
    permission: "inventory.view",
    handler: async (req, res) => {
      const q = parse(reservationListSchema, req.query);
      const { items, total } = await listReservations(q);
      ok(res, items, "Reservations", { page: q.page, limit: q.limit, total });
    },
  },
});
