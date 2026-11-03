import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { AppError, conflict, notFound } from "../../lib/errors";
import type { AuthUser } from "../../lib/auth";
import { audit } from "../utils/audit";
import { skipTake, type Pagination } from "../../lib/validation";
import { appConfig } from "../../config/app.config";
import { APPROVER_TYPE } from "./approval.service";

// ── Roles & permissions ──────────────────────────────────────

export const roleSchema = z.object({
  roleName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: { roleName: "asc" },
    include: {
      rolePermissions: { select: { permission: { select: { permissionKey: true } } } },
      _count: { select: { userRoles: true } },
    },
  });
}

export async function listPermissionCatalogue() {
  return prisma.permission.findMany({ orderBy: [{ module: "asc" }, { permissionKey: "asc" }] });
}

export async function createRole(actor: AuthUser, input: z.infer<typeof roleSchema>, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: { roleName: input.roleName, description: input.description ?? null, isActive: input.isActive ?? true },
    });
    await audit(tx, { actorUserId: actor.id, action: "role.create", entityType: "role", entityId: role.id, after: input, correlationId });
    return role;
  });
}

export async function updateRole(actor: AuthUser, id: number, input: Partial<z.infer<typeof roleSchema>>, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.role.findUnique({ where: { id } });
    if (!before) throw notFound("Role");
    const role = await tx.role.update({
      where: { id },
      data: {
        ...(input.roleName !== undefined ? { roleName: input.roleName } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await audit(tx, { actorUserId: actor.id, action: "role.update", entityType: "role", entityId: id, before, after: role, correlationId });
    return role;
  });
}

/** Replace a role's permission set with exactly the given keys (explicit, audited). */
export async function setRolePermissions(actor: AuthUser, roleId: number, keys: string[], correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { id: roleId },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) throw notFound("Role");
    const perms = await tx.permission.findMany({ where: { permissionKey: { in: keys } } });
    if (perms.length !== new Set(keys).size) throw new AppError("VALIDATION_ERROR", "Unknown permission key in request");

    const before = role.rolePermissions.map((rp) => rp.permission.permissionKey).sort();
    const wanted = new Set(perms.map((p) => p.id));
    const current = new Set(role.rolePermissions.map((rp) => rp.permissionId));

    const toRemove = Array.from(current).filter((id) => !wanted.has(id));
    const toAdd = Array.from(wanted).filter((id) => !current.has(id));
    if (toRemove.length) await tx.rolePermission.deleteMany({ where: { roleId, permissionId: { in: toRemove } } });
    for (const permissionId of toAdd) await tx.rolePermission.create({ data: { roleId, permissionId } });

    await audit(tx, {
      actorUserId: actor.id,
      action: "role.permissions.set",
      entityType: "role",
      entityId: roleId,
      before,
      after: [...keys].sort(),
      correlationId,
    });
    return { added: toAdd.length, removed: toRemove.length };
  });
}

// ── Users (existing users table — read only, plus role assignment) ──

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
    prisma.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      ...skipTake(p),
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        email: true,
        department: true,
        designation: true,
        isActive: true,
        userRoles: { select: { role: { select: { id: true, roleName: true } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export async function assignRole(actor: AuthUser, userId: number, roleId: number, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw notFound("User");
    const role = await tx.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFound("Role");
    const existing = await tx.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } });
    if (existing) throw conflict("User already has this role");
    await tx.userRole.create({ data: { userId, roleId, assignedByUserId: actor.id } });
    await audit(tx, {
      actorUserId: actor.id,
      action: "user.role.assign",
      entityType: "user",
      entityId: userId,
      after: { roleId, roleName: role.roleName },
      correlationId,
    });
  });
}

export async function removeRole(actor: AuthUser, userId: number, roleId: number, correlationId?: string) {
  return prisma.$transaction(async (tx) => {
    if (userId === actor.id) {
      const role = await tx.role.findUnique({
        where: { id: roleId },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (role?.rolePermissions.some((rp) => rp.permission.permissionKey === "admin.roles.manage")) {
        throw new AppError("VALIDATION_ERROR", "You cannot remove your own role-administration role");
      }
    }
    const r = await tx.userRole.deleteMany({ where: { userId, roleId } });
    if (r.count === 0) throw notFound("Role assignment");
    await audit(tx, {
      actorUserId: actor.id,
      action: "user.role.remove",
      entityType: "user",
      entityId: userId,
      before: { roleId },
      correlationId,
    });
  });
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
        roleId: z.coerce.number().int().positive().nullable().optional(),
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
      stages: { orderBy: [{ stageOrder: "asc" }, { id: "asc" }], include: { role: { select: { roleName: true } } } },
      _count: { select: { requests: true } },
    },
  });
}

/** Saving a workflow always creates a new version and deactivates older ones. History is never rewritten. */
export async function saveWorkflowVersion(actor: AuthUser, input: WorkflowInput, correlationId?: string) {
  for (const s of input.stages) {
    if (s.approverType === APPROVER_TYPE.ROLE && !s.roleId) {
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
            roleId: s.approverType === APPROVER_TYPE.ROLE ? s.roleId ?? null : null,
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
