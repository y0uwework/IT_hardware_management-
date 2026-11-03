import { z } from "zod";
import { Where, execute, getPool, likeContains, query, queryOne, withTransaction, type Params, type Tx } from "../../lib/db";
import { AppError, conflict, notFound } from "../../lib/errors";
import { parsePermissionIds, serializePermissionIds, type AuthUser } from "../../lib/auth";
import { audit } from "../utils/audit";
import { auditLogCols, categoryCols, permissionCols, stageCols, warehouseCols, workflowCols } from "../utils/sql-columns";
import { skipTake, type Pagination } from "../../lib/validation";
import { appConfig } from "../../config/app.config";
import { APPROVER_TYPE } from "./approval.service";
import { isRoleKey, listRoleDefinitions, roleName, roles, type RoleKey } from "../../config/roles.config";

// ── Roles (defined in config/roles.config.ts) & per-user permissions ──

export function listRoles() {
  return listRoleDefinitions();
}

export async function listPermissionCatalogue() {
  return query(
    await getPool(),
    `SELECT ${permissionCols("p")} FROM dbo.permissions p ORDER BY p.module, p.permission_key`
  );
}

const USER_ACCESS_COLUMNS = `u.id, u.employee_code AS employeeCode, u.full_name AS fullName, u.email, u.department,
  u.designation, u.is_active AS isActive, u.role, u.permissions`;

interface UserAccessRow {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  designation: string | null;
  isActive: boolean;
  role: string | null;
  permissions: string;
}

/** Shape a user row for the API: role name resolved, permissions as an array of IDs. */
function toUserAccess(u: UserAccessRow) {
  return { ...u, roleName: roleName(u.role), permissions: parsePermissionIds(u.permissions) };
}

async function loadUserAccess(tx: Tx, userId: number) {
  const row = await queryOne<UserAccessRow>(tx, `SELECT ${USER_ACCESS_COLUMNS} FROM dbo.users u WHERE u.id = @userId`, { userId });
  if (!row) throw notFound("User");
  return toUserAccess(row);
}

async function permissionIdsForKeys(tx: Tx, keys: readonly string[]) {
  const unique = Array.from(new Set(keys));
  if (unique.length === 0) return [];
  const perms = await query<{ id: number }>(tx, `SELECT id FROM dbo.permissions WHERE permission_key IN (@keys)`, {
    keys: unique,
  });
  if (perms.length !== unique.length) {
    throw new AppError("VALIDATION_ERROR", "Unknown permission key. Run `npm run seed` to sync the permission catalogue.");
  }
  return perms.map((p) => p.id);
}

/** An administrator may not strip their own ability to manage user access. */
async function guardSelfLockout(tx: Tx, actor: AuthUser, userId: number, nextIds: number[]) {
  if (userId !== actor.id) return;
  const manage = await queryOne<{ id: number }>(tx, `SELECT id FROM dbo.permissions WHERE permission_key = @key`, {
    key: "admin.roles.manage",
  });
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
  return withTransaction(async (tx) => {
    const before = await queryOne<{ role: string | null; permissions: string }>(
      tx,
      `SELECT role, permissions FROM dbo.users WHERE id = @userId`,
      { userId }
    );
    if (!before) throw notFound("User");
    const role = input.role as RoleKey | null;

    let permissions = before.permissions;
    if (input.applyDefaults) {
      const ids = role ? await permissionIdsForKeys(tx, roles[role].defaultPermissions) : [];
      await guardSelfLockout(tx, actor, userId, ids);
      permissions = serializePermissionIds(ids);
    }
    await execute(tx, `UPDATE dbo.users SET role = @role, permissions = @permissions WHERE id = @userId`, {
      role,
      permissions,
      userId,
    });
    await audit(tx, {
      actorUserId: actor.id,
      action: "user.role.set",
      entityType: "user",
      entityId: userId,
      before,
      after: { role, permissions },
      correlationId,
    });
    return loadUserAccess(tx, userId);
  });
}

export const userPermissionsSchema = z.object({ permissions: z.array(z.string().max(100)).max(500) });

/** Replace a user's permissions with exactly the given keys (stored as permission IDs). */
export async function setUserPermissions(actor: AuthUser, userId: number, keys: string[], correlationId?: string) {
  return withTransaction(async (tx) => {
    const before = await queryOne<{ permissions: string }>(tx, `SELECT permissions FROM dbo.users WHERE id = @userId`, { userId });
    if (!before) throw notFound("User");
    const ids = await permissionIdsForKeys(tx, keys);
    await guardSelfLockout(tx, actor, userId, ids);
    const permissions = serializePermissionIds(ids);
    await execute(tx, `UPDATE dbo.users SET permissions = @permissions WHERE id = @userId`, { permissions, userId });
    await audit(tx, {
      actorUserId: actor.id,
      action: "user.permissions.set",
      entityType: "user",
      entityId: userId,
      before: { permissions: before.permissions },
      after: { permissions },
      correlationId,
    });
    return loadUserAccess(tx, userId);
  });
}

// ── Users (existing users table) ──

export async function searchUsers(p: Pagination & { activeOnly?: boolean }) {
  const where = new Where();
  if (p.activeOnly) where.add("u.is_active = 1");
  if (p.search) {
    where.add("(u.full_name LIKE @search OR u.employee_code LIKE @search OR u.email LIKE @search)", {
      search: likeContains(p.search),
    });
  }
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query<UserAccessRow>(
      pool,
      `SELECT ${USER_ACCESS_COLUMNS} FROM dbo.users u ${where}
       ORDER BY u.full_name, u.id OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(p) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total FROM dbo.users u ${where}`, where.params),
  ]);
  return { items: items.map(toUserAccess), total: total?.total ?? 0 };
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
  const pool = await getPool();
  const [workflows, stages] = await Promise.all([
    query(
      pool,
      `SELECT ${workflowCols("w")},
              (SELECT COUNT(*) FROM dbo.hardware_requests r WHERE r.workflow_id = w.id) AS [_count.requests]
       FROM dbo.approval_workflows w
       ORDER BY w.workflow_key, w.version DESC`
    ),
    query(pool, `SELECT ${stageCols("s")} FROM dbo.approval_workflow_stages s ORDER BY s.stage_order, s.id`),
  ]);
  return workflows.map((w) => ({ ...w, stages: stages.filter((s) => s.workflowId === w.id) }));
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
  return withTransaction(async (tx) => {
    const latest = await queryOne<{ id: number; version: number }>(
      tx,
      `SELECT TOP 1 id, version FROM dbo.approval_workflows WITH (UPDLOCK, HOLDLOCK)
       WHERE workflow_key = @workflowKey ORDER BY version DESC`,
      { workflowKey: input.workflowKey }
    );
    await execute(tx, `UPDATE dbo.approval_workflows SET is_active = 0 WHERE workflow_key = @workflowKey`, {
      workflowKey: input.workflowKey,
    });
    const wf = (await queryOne<{ id: number; version: number }>(
      tx,
      `INSERT INTO dbo.approval_workflows
         (workflow_key, name, version, request_type, department, min_amount, max_amount, priority, is_active, created_by_user_id)
       OUTPUT INSERTED.id, INSERTED.version
       VALUES (@workflowKey, @name, @version, @requestType, @department, @minAmount, @maxAmount, @priority, 1, @createdByUserId)`,
      {
        workflowKey: input.workflowKey,
        name: input.name,
        version: (latest?.version ?? 0) + 1,
        requestType: input.requestType ?? null,
        department: input.department || null,
        minAmount: input.minAmount ?? null,
        maxAmount: input.maxAmount ?? null,
        priority: input.priority,
        createdByUserId: actor.id,
      }
    ))!;
    for (const s of input.stages) {
      await execute(
        tx,
        `INSERT INTO dbo.approval_workflow_stages (workflow_id, stage_order, name, approver_type, role_key, due_days)
         VALUES (@workflowId, @stageOrder, @name, @approverType, @roleKey, @dueDays)`,
        {
          workflowId: wf.id,
          stageOrder: s.stageOrder,
          name: s.name,
          approverType: s.approverType,
          roleKey: s.approverType === APPROVER_TYPE.ROLE ? s.roleKey ?? null : null,
          dueDays: s.dueDays,
        }
      );
    }
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
  return withTransaction(async (tx) => {
    const wf = await queryOne<{ workflowKey: string }>(
      tx,
      `SELECT workflow_key AS workflowKey FROM dbo.approval_workflows WHERE id = @id`,
      { id }
    );
    if (!wf) throw notFound("Workflow");
    if (isActive) {
      await execute(tx, `UPDATE dbo.approval_workflows SET is_active = 0 WHERE workflow_key = @workflowKey`, {
        workflowKey: wf.workflowKey,
      });
    }
    await execute(tx, `UPDATE dbo.approval_workflows SET is_active = @isActive WHERE id = @id`, { id, isActive });
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
  return query(
    await getPool(),
    `SELECT ${categoryCols("c")} FROM dbo.hardware_categories c ${activeOnly ? "WHERE c.is_active = 1" : ""} ORDER BY c.name, c.id`
  );
}

export async function listWarehouses(activeOnly = false) {
  return query(
    await getPool(),
    `SELECT ${warehouseCols("w")} FROM dbo.warehouses w ${activeOnly ? "WHERE w.is_active = 1" : ""} ORDER BY w.name, w.id`
  );
}

/**
 * INSERT or UPDATE one master-data row from validated input. Fields left undefined are not
 * touched on update (and default to NULL on insert). Column names come from code, never input.
 */
async function saveRow(tx: Tx, table: string, id: number | null, columns: Record<string, string>, input: Params) {
  const fields = Object.keys(columns).filter((f) => input[f] !== undefined);
  const params: Params = {};
  for (const f of fields) params[f] = input[f];
  if (id) {
    await execute(tx, `UPDATE dbo.${table} SET ${fields.map((f) => `[${columns[f]}] = @${f}`).join(", ")} WHERE id = @id`, {
      ...params,
      id,
    });
    return id;
  }
  const row = await queryOne<{ id: number }>(
    tx,
    `INSERT INTO dbo.${table} (${fields.map((f) => `[${columns[f]}]`).join(", ")}) OUTPUT INSERTED.id
     VALUES (${fields.map((f) => `@${f}`).join(", ")})`,
    params
  );
  return row!.id;
}

const CATEGORY_COLUMNS = { code: "code", name: "name", description: "description", isSerialized: "is_serialized", isActive: "is_active" };
const WAREHOUSE_COLUMNS = { code: "code", name: "name", location: "location", isActive: "is_active" };

export async function upsertCategory(actor: AuthUser, id: number | null, input: z.infer<typeof categorySchema>, correlationId?: string) {
  return withTransaction(async (tx) => {
    const load = (rowId: number) => queryOne(tx, `SELECT ${categoryCols("c")} FROM dbo.hardware_categories c WHERE c.id = @id`, { id: rowId });
    const before = id ? await load(id) : null;
    if (id && !before) throw notFound("Category");
    if (before && before.isSerialized !== input.isSerialized) {
      const used = await queryOne<{ n: number }>(tx, `SELECT COUNT(*) AS n FROM dbo.inventory_stock WHERE category_id = @id`, {
        id: before.id,
      });
      if (used?.n) throw conflict("Tracking type cannot change once the category has stock");
    }
    const rowId = await saveRow(tx, "hardware_categories", id, CATEGORY_COLUMNS, input);
    const row = (await load(rowId))!;
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
  return withTransaction(async (tx) => {
    const load = (rowId: number) => queryOne(tx, `SELECT ${warehouseCols("w")} FROM dbo.warehouses w WHERE w.id = @id`, { id: rowId });
    const before = id ? await load(id) : null;
    if (id && !before) throw notFound("Warehouse");
    const rowId = await saveRow(tx, "warehouses", id, WAREHOUSE_COLUMNS, input);
    const row = (await load(rowId))!;
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
  const where = new Where();
  if (p.entityType) where.add("l.entity_type = @entityType", { entityType: p.entityType });
  if (p.entityId) where.add("l.entity_id = @entityId", { entityId: p.entityId });
  if (p.search) where.add("l.[action] LIKE @search", { search: likeContains(p.search) });
  const pool = await getPool();
  const [items, total] = await Promise.all([
    query(
      pool,
      `SELECT ${auditLogCols("l")}, u.full_name AS [actor.fullName], u.employee_code AS [actor.employeeCode]
       FROM dbo.audit_logs l
       LEFT JOIN dbo.users u ON u.id = l.actor_user_id
       ${where}
       ORDER BY l.created_at DESC, l.id DESC
       OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      { ...where.params, ...skipTake(p) }
    ),
    queryOne<{ total: number }>(pool, `SELECT COUNT(*) AS total FROM dbo.audit_logs l ${where}`, where.params),
  ]);
  return { items, total: total?.total ?? 0 };
}
