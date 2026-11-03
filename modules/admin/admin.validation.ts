// admin module — request validation (zod schemas).
import { z } from "zod";
import { paginationSchema } from "../../shared/validation";
import { isRoleKey } from "../../shared/config/roles.config";
import { appConfig } from "../../shared/config/app.config";
import { APPROVER_TYPE } from "../approvals/approvals.types";

export const auditLogListSchema = paginationSchema.extend({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
});

export const workflowActiveSchema = z.object({ isActive: z.boolean() });

export const userSearchSchema = paginationSchema.extend({ activeOnly: z.enum(["true", "false"]).optional() });

export const userRoleSchema = z.object({
  role: z.string().refine(isRoleKey, "Unknown role").nullable(),
  /** true (default) replaces the user's permissions with the role's default set. */
  applyDefaults: z.boolean().default(true),
});

export const userPermissionsSchema = z.object({ permissions: z.array(z.string().max(100)).max(500) });

export const workflowSchema = z.object({
  workflowKey: z.string().trim().min(2).max(100).regex(/^[a-z0-9_-]+$/, "Lowercase letters, digits, - and _ only"),
  name: z.string().trim().min(2).max(150),
  requestType: z.enum(appConfig.requestTypes).nullable().optional(),
  department: z.string().trim().max(100).nullable().optional(),
  minAmount: z.coerce.number().nonnegative().nullable().optional(),
  maxAmount: z.coerce.number().nonnegative().nullable().optional(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  stages: z
    .array(
      z.object({
        stageOrder: z.coerce.number().int().min(1).max(50),
        name: z.string().trim().min(2).max(150),
        approverType: z.enum([APPROVER_TYPE.MANAGER, APPROVER_TYPE.ROLE]),
        roleKey: z.string().refine(isRoleKey, "Unknown role").nullable().optional(),
        dueDays: z.coerce.number().int().min(1).max(60).default(3),
      })
    )
    .max(20),
});

export const categorySchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[A-Z0-9_-]+$/, "Uppercase letters, digits, - and _ only"),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).nullable().optional(),
  isSerialized: z.boolean(),
  isActive: z.boolean().default(true),
});

export const warehouseSchema = z.object({
  code: z.string().trim().min(2).max(50).regex(/^[A-Z0-9_-]+$/, "Uppercase letters, digits, - and _ only"),
  name: z.string().trim().min(2).max(150),
  location: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().default(true),
});
