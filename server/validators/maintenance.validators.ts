import { z } from "zod";
import { appConfig } from "../../config/app.config";
import { MAINTENANCE_STATUS } from "../../config/status.config";
import { id, optText, price, qty } from "./procurement.validators";

const blankToNull = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);

export const ticketCreateSchema = z.object({
  assetId: z.preprocess(blankToNull, id().nullable()),
  title: z.string().trim().min(5, "Summarise the problem in a few words").max(200),
  description: z.string().trim().min(10, "Describe what is happening").max(4000),
  issueCategory: z.enum(appConfig.issueCategories),
  priority: z.enum(appConfig.priorities).default("Normal"),
  severity: z.enum(appConfig.severities).default("Minor"),
});
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

export const ticketListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxLimit).default(appConfig.pagination.defaultLimit),
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().max(40).optional(),
  scope: z.enum(["mine", "assigned", "all"]).default("mine"),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type TicketListQuery = z.infer<typeof ticketListSchema>;

export const assignSchema = z.object({ assigneeUserId: id("Choose a technician"), comments: optText(1000) });

export const progressSchema = z.object({
  status: z.enum([MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.WAITING_FOR_PARTS]),
  comments: optText(2000),
  // Move an in-store asset to "Under Maintenance" while it is being repaired.
  takeAssetIn: z.boolean().default(false),
});

export const activitySchema = z.object({
  activityType: z.enum(["Diagnosis", "Repair", "Note"]),
  description: z.string().trim().min(2, "Describe the work").max(4000),
  hoursSpent: z.preprocess(blankToNull, z.coerce.number().min(0).max(999).nullable()),
});

export const partSchema = z.object({
  partName: z.string().trim().min(2, "Name the part").max(200),
  itemId: z.preprocess(blankToNull, id().nullable()),
  quantity: qty,
  unitCost: price,
  vendorId: z.preprocess(blankToNull, id().nullable()),
});

export const resolveSchema = z.object({
  resolutionNotes: z.string().trim().min(5, "Say how it was fixed").max(4000),
  // Where an asset that was taken in goes next.
  assetNextStatus: z.enum(["Available", "Damaged", "Retired"]).default("Available"),
});

export const closeSchema = z.object({ comments: optText(1000) });
export const reopenSchema = z.object({ reason: z.string().trim().min(5, "Say what is still wrong").max(2000) });
