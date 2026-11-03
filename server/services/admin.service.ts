import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError, conflict, notFound } from "../../lib/errors";
import { parsePermissionIds, serializePermissionIds, type AuthUser } from "../../lib/auth";
import { audit } from "../utils/audit";
import { skipTake, type Pagination } from "../../lib/validation";
import { appConfig } from "../../config/app.config";
import { APPROVER_TYPE } from "./approval.service";
import { isRoleKey, listRoleDefinitions, roleName, roles, type RoleKey } from "../../config/roles.config";

type Tx = Prisma.TransactionClient;

// ── Roles (defined in config/roles.config.ts) & per-user permissions ──

export function listRoles() {
  return listRoleDefinitions();
}

export async function listPermissionCatalogue() {
  return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { permissionKey: "asc" }] });
}

const USER_ACCESS_SELECT = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  department: true,
  designation: true,
  isActive: true,
  role: true,
  permissions: true,
} satisfies Prisma.UserSelect;

/** Shape a user row for the API: role name resolved, permissions as an array of IDs. */
function toUserAccess(u: Prisma.UserGetPayload<{ select: typeof USER_ACCESS_SELECT }>) {
  return { ...u, roleName: roleName(u.role), permissions: parsePermissionIds(u.permissions) };
}

async function permissionIdsForKeys(tx: Tx, keys: readonly string[]) {
  const unique = Array.from(new Set(keys));
  const perms = await tx.permission.findMany({ where: { permissionKey: { in: unique } }, select: { id: true } });
  if (perms.length !== unique.length) {
    throw new AppError("VALIDATION_ERROR", "Unknown permission key. Run `npm run seed` to sync the permission catalogue.");
  }
  return perms.map((p) => p.id);
}

/** An administrator may not strip their own ability to manage user access. */
async function guardSelfLockout(tx: Tx, actor: AuthUser, userId: number, nextIds: number[]) {
  if (userId !== actor.id) return;
  const manage = await tx.permission.findUnique({ where: { permissionKey: "admin.roles.manage" }, select: { id: true } });
  if (manage && !nextIds.includes(manage.id)) {
    throw new AppError("VALIDATION_ERROR", "You cannot remove your own user-access administration permission");
  }
}

export const userRoleSchema = z.object({
  role: z.string().refine(isRoleKey, "Unknown role").nullable(),
  /** true (default) replaces the user's permissions with the role's default set. */
  applyDefaults: z.boolean().default(true),
});

export async function setUserRole(actor: AuthUser, userId: number, input: z.infer<typeof userRoleSchema>, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true } });
    if (!before) throw notFound("User");
    const role = input.role as RoleKey | null;

    let permissions = before.permissions;
    if (input.applyDefaults) {
      const ids = role ? await permissionIdsForKeys(tx, roles[role].defaultPermissions) : [];
      await guardSelfLockout(tx, actor, userId, ids);
      permissions = serializePermissionIds(ids);
    }
    const user = await tx.user.update({ where: { id: userId }, data: { role, permissions }, select: USER_ACCESS_SELECT });
    await audit(tx, {
      actorUserId: actor.id,
      action: "user.role.set",
      entityType: "user",
      entityId: userId,
      before,
      after: { role, permissions },
      correlationId,
    });
    return toUserAccess(user);
  });
}

export const userPermissionsSchema = z.object({ permissions: z.array(z.string().max(100)).max(500) });

/** Replace a user's permissions with exactly the given keys (stored as permission IDs). */
export async function setUserPermissions(actor: AuthUser, userId: number, keys: string[], correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: { permissions: true } });
    if (!before) throw notFound("User");
    const ids = await permissionIdsForKeys(tx, keys);
    await guardSelfLockout(tx, actor, userId, ids);
    const permissions = serializePermissionIds(ids);
    const user = await tx.user.update({ where: { id: userId }, data: { permissions }, select: USER_ACCESS_SELECT });
    await audit(tx, {
      actorUserId: actor.id,
      action: "user.permissions.set",
      entityType: "user",
      entityId: userId,
      before: { permissions: before.permissions },
      after: { permissions },
      correlationId,
    });
    return toUserAccess(user);
  });
}

// ── Users (existing users table) ──

export async function searchUsers(p: Pagination & { activeOnly?: boolean }) {
  const where: Prisma.UserWhereInput = {
    ...(p.activeOnly ? { isActive: true } : {}),
    ...(p.search
      ? {
          OR: [
            { fullName: { contains: p.search } },
            { employeeCode: { contains: p.search } },
            { email: { contains: p.search } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { fullName: "asc" }, ...skipTake(p), select: USER_ACCESS_SELECT }),
    prisma.user.count({ where }),
  ]);
  return { items: items.map(toUserAccess), total };
}

// ── Workflows (versioned; edits create a new version) ──

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
export type WorkflowInput = z.infer<typeof workflowSchema>;

export async function listWorkflows() {
  return prisma.approvalWorkflow.findMany({
    orderBy: [{ workflowKey: "asc" }, { version: "desc" }],
    include: {
      stages: { orderBy: [{ stageOrder: "asc" }, { id: "asc" }] },
      _count: { select: { requests: true } },
    },
  });
}

/** Saving a workflow always creates a new version and deactivates older ones. History is never rewritten. */
export async function saveWorkflowVersion(actor: AuthUser, input: WorkflowInput, correlationId?: string) {
  for (const s of input.stages) {
    if (s.approverType === APPROVER_TYPE.ROLE && !s.roleKey) {
      throw new AppError("VALIDATION_ERROR", `Stage "${s.name}" needs a role`);
    }
  }
  if (input.minAmount != null && input.maxAmount != null && input.minAmount > input.maxAmount) {
    throw new AppError("VALIDATION_ERROR", "Minimum amount cannot exceed maximum amount");
  }
  return prisma.$transaction(async (tx) => {
    const latest = await tx.approvalWorkflow.findFirst({
      where: { workflowKey: input.workflowKey },
      orderBy: { version: "desc" },
    });
    await tx.approvalWorkflow.updateMany({ where: { workflowKey: input.workflowKey }, data: { isActive: false } });
    const wf = await tx.approvalWorkflow.create({
      data: {
        workflowKey: input.workflowKey,
        name: input.name,
        version: (latest?.version ?? 0) + 1,
        requestType: input.requestType ?? null,
        department: input.department || null,
        minAmount: input.minAmount == null ? null : new Prisma.Decimal(input.minAmount),
        maxAmount: input.maxAmount == null ? null : new Prisma.Decimal(input.maxAmount),
        priority: input.priority,
        isActive: true,
        createdByUserId: actor.id,
        stages: {
          create: input.stages.map((s) => ({
            stageOrder: s.stageOrder,
            name: s.name,
            approverType: s.approverType,
            roleKey: s.approverType === APPROVER_TYPE.ROLE ? s.roleKey ?? null : null,
            dueDays: s.dueDays,
          })),
        },
      },
    });
    await audit(tx, {
      actorUserId: actor.id,
      action: "workflow.version.create",
      entityType: "approval_workflow",
      entityId: wf.id,
      before: latest ? { id: latest.id, version: latest.version } : null,
      after: input,
      correlationId,
    });
    return { id: wf.id, version: wf.version };
  });
}

export async function setWorkflowActive(actor: AuthUser, id: number, isActive: boolean, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const wf = await tx.approvalWorkflow.findUnique({ where: { id } });
    if (!wf) throw notFound("Workflow");
    if (isActive) {
      await tx.approvalWorkflow.updateMany({ where: { workflowKey: wf.workflowKey }, data: { isActive: false } });
    }
    await tx.approvalWorkflow.update({ where: { id }, data: { isActive } });
    await audit(tx, {
      actorUserId: actor.id,
      action: isActive ? "workflow.activate" : "workflow.deactivate",
      entityType: "approval_workflow",
      entityId: id,
      correlationId,
    });
  });
}

// ── Master data ──

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

export async function listCategories(activeOnly = false) {
  return prisma.hardwareCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { name: "asc" },
  });
}

export async function listWarehouses(activeOnly = false) {
  return prisma.warehouse.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { name: "asc" },
  });
}

export async function upsertCategory(actor: AuthUser, id: number | null, input: z.infer<typeof categorySchema>, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.hardwareCategory.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound("Category");
    if (before && before.isSerialized !== input.isSerialized) {
      const used = await tx.inventoryStock.count({ where: { categoryId: before.id } });
      if (used) throw conflict("Tracking type cannot change once the category has stock");
    }
    const row = id
      ? await tx.hardwareCategory.update({ where: { id }, data: input })
      : await tx.hardwareCategory.create({ data: input });
    await audit(tx, {
      actorUserId: actor.id,
      action: id ? "category.update" : "category.create",
      entityType: "hardware_category",
      entityId: row.id,
      before,
      after: row,
      correlationId,
    });
    return row;
  });
}

export async function upsertWarehouse(actor: AuthUser, id: number | null, input: z.infer<typeof warehouseSchema>, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const before = id ? await tx.warehouse.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound("Warehouse");
    const row = id
      ? await tx.warehouse.update({ where: { id }, data: input })
      : await tx.warehouse.create({ data: input });
    await audit(tx, {
      actorUserId: actor.id,
      action: id ? "warehouse.update" : "warehouse.create",
      entityType: "warehouse",
      entityId: row.id,
      before,
      after: row,
      correlationId,
    });
    return row;
  });
}

// ── Audit ──

export async function listAuditLogs(p: Pagination & { entityType?: string; entityId?: string }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(p.entityType ? { entityType: p.entityType } : {}),
    ...(p.entityId ? { entityId: p.entityId } : {}),
    ...(p.search ? { action: { contains: p.search } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...skipTake(p),
      include: { actor: { select: { fullName: true, employeeCode: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
