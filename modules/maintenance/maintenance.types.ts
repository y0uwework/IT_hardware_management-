// maintenance module — types.
import type { z } from "zod";
import type { ticketActionSchema, ticketCreateSchema, ticketListSchema } from "./maintenance.validation";

export type TicketAction = z.infer<typeof ticketActionSchema>;

export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

export type TicketListQuery = z.infer<typeof ticketListSchema>;
