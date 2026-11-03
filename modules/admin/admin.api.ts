// admin module — API route handlers. Each pages/api/v1/... route file re-exports one of these.
import { withApi } from "../../middlewares/authenticate";
import { listAuditLogs, listCategories, listPermissionCatalogue, listRoles, listWarehouses, listWorkflows, saveWorkflowVersion, searchUsers, setUserPermissions, setUserRole, setWorkflowActive, upsertCategory, upsertWarehouse } from "./admin.service";
import { created, ok } from "../../shared/api-response";
import { paginationSchema, parse, parseId } from "../../shared/validation";
import { auditLogListSchema, categorySchema, userPermissionsSchema, userRoleSchema, userSearchSchema, warehouseSchema, workflowActiveSchema, workflowSchema } from "./admin.validation";

// /api/v1/admin/audit-logs
export const adminAuditLogsHandler = withApi({
  GET: {
    permission: "audit.view",
    handler: async (req, res) => {
      const q = parse(auditLogListSchema, req.query);
      const { items, total } = await listAuditLogs(q);
      ok(res, items, "Audit logs", { page: q.page, limit: q.limit, total });
    },
  },
});

// /api/v1/admin/permissions
export const adminPermissionsHandler = withApi({
  GET: { permission: "admin.roles.manage", handler: async (_req, res) => ok(res, await listPermissionCatalogue(), "Permissions") },
});

// /api/v1/admin/roles
// Roles are defined in shared/config/roles.config.ts — read only.
export const adminRolesHandler = withApi({
  GET: {
    permission: ["admin.roles.manage", "admin.workflow.manage"],
    handler: async (_req, res) => ok(res, listRoles(), "Roles"),
  },
});

// /api/v1/admin/users/[id]/permissions
// PUT { permissions: ["request.view", ...] } — stored on the user as permission IDs.
export const adminUsersByIdPermissionsHandler = withApi({
  PUT: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { permissions } = parse(userPermissionsSchema, req.body);
      ok(res, await setUserPermissions(user, parseId(req.query.id), permissions, correlationId), "Permissions saved");
    },
  },
});

// /api/v1/admin/users/[id]/role
// PUT { role: "IT_ADMIN" | null, applyDefaults?: boolean }
export const adminUsersByIdRoleHandler = withApi({
  PUT: {
    permission: "admin.roles.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await setUserRole(user, parseId(req.query.id), parse(userRoleSchema, req.body), correlationId), "Role updated"),
  },
});

// /api/v1/admin/workflows/[id]/active
export const adminWorkflowsByIdActiveHandler = withApi({
  POST: {
    permission: "admin.workflow.manage",
    handler: async (req, res, { user, correlationId }) => {
      const { isActive } = parse(workflowActiveSchema, req.body);
      await setWorkflowActive(user, parseId(req.query.id), isActive, correlationId);
      ok(res, null, isActive ? "Workflow activated" : "Workflow deactivated");
    },
  },
});

// /api/v1/admin/workflows
export const adminWorkflowsHandler = withApi({
  GET: { permission: "admin.workflow.manage", handler: async (_req, res) => ok(res, await listWorkflows(), "Workflows") },
  POST: {
    permission: "admin.workflow.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await saveWorkflowVersion(user, parse(workflowSchema, req.body), correlationId), "Workflow version saved"),
  },
});

// /api/v1/master-data/categories/[id]
export const masterDataCategoriesByIdHandler = withApi({
  PUT: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await upsertCategory(user, parseId(req.query.id), parse(categorySchema, req.body), correlationId), "Category updated"),
  },
});

// /api/v1/master-data/categories
export const masterDataCategoriesHandler = withApi({
  // Any signed-in user needs categories to build a request.
  GET: {
    handler: async (req, res, { user }) => {
      const all = req.query.all === "true" && user.permissions.includes("admin.master_data.manage");
      ok(res, await listCategories(!all), "Categories");
    },
  },
  POST: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await upsertCategory(user, null, parse(categorySchema, req.body), correlationId), "Category created"),
  },
});

// /api/v1/master-data/warehouses/[id]
export const masterDataWarehousesByIdHandler = withApi({
  PUT: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      ok(res, await upsertWarehouse(user, parseId(req.query.id), parse(warehouseSchema, req.body), correlationId), "Warehouse updated"),
  },
});

// /api/v1/master-data/warehouses
export const masterDataWarehousesHandler = withApi({
  GET: {
    permission: ["inventory.view", "asset.create", "asset.return", "request.it_review", "admin.master_data.manage"],
    handler: async (req, res, { user }) => {
      const all = req.query.all === "true" && user.permissions.includes("admin.master_data.manage");
      ok(res, await listWarehouses(!all), "Warehouses");
    },
  },
  POST: {
    permission: "admin.master_data.manage",
    handler: async (req, res, { user, correlationId }) =>
      created(res, await upsertWarehouse(user, null, parse(warehouseSchema, req.body), correlationId), "Warehouse created"),
  },
});

// /api/v1/users
export const usersHandler = withApi({
  GET: {
    permission: ["employee.view", "asset.assign", "admin.roles.manage"],
    handler: async (req, res) => {
      const q = parse(userSearchSchema, req.query);
      const { items, total } = await searchUsers({ ...q, activeOnly: q.activeOnly === "true" });
      ok(res, items, "Users", { page: q.page, limit: q.limit, total });
    },
  },
});
