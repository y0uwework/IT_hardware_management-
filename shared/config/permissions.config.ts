// Source of truth for which permission keys exist.
// `npm run seed` synchronizes this catalogue into the `permissions` table.
// Roles (shared/config/roles.config.ts) supply default permission sets; each user's granted
// permission IDs are stored in users.permissions and can be adjusted per user.

export const permissions = [
  {
    key: "dashboard.view",
    module: "Dashboard",
    description: "View application dashboard",
  },

  {
    key: "employee.view",
    module: "Employee",
    description: "View authorized existing user records",
  },
  {
    key: "add.employee",
    module: "Employee",
    description: "Create or onboard employee records",
  },

  {
    key: "request.create",
    module: "Requests",
    description: "Create asset requests",
  },
  {
    key: "request.view",
    module: "Requests",
    description: "View own and authorized asset requests",
  },
  {
    key: "request.view.all",
    module: "Requests",
    description: "View all asset requests across the organization",
  },
  {
    key: "request.it_review",
    module: "Requests",
    description: "Perform IT technical review and define fulfilment",
  },

  {
    key: "request.approve",
    module: "Approvals",
    description: "Approve asset requests",
  },
  {
    key: "approve.button",
    module: "Approvals",
    description: "Display approval action where authorized",
  },

  { key: "inventory.view", module: "Inventory", description: "View inventory" },
  {
    key: "inventory.manage",
    module: "Inventory",
    description: "Manage stock and inventory movements",
  },

  {
    key: "asset.view",
    module: "Assets",
    description: "View own assigned assets",
  },
  {
    key: "asset.view.all",
    module: "Assets",
    description: "View the full asset register",
  },
  {
    key: "asset.create",
    module: "Assets",
    description: "Register assets",
  },
  {
    key: "asset.assign",
    module: "Assets",
    description: "Assign assets",
  },
  {
    key: "asset.return",
    module: "Assets",
    description: "Process asset returns",
  },

  {
    key: "item.view",
    module: "Item Master",
    description: "View the item master",
  },
  {
    key: "item.create",
    module: "Item Master",
    description: "Add items to the item master",
  },
  {
    key: "item.edit",
    module: "Item Master",
    description: "Edit item master records",
  },
  {
    key: "item.delete",
    module: "Item Master",
    description: "Delete (deactivate permanently) item master records",
  },
  {
    key: "item.bulk_upload",
    module: "Item Master",
    description: "Bulk upload items from a CSV sheet",
  },

  {
    key: "procurement.manage",
    module: "Procurement",
    description: "Manage vendors, requisitions, quotations and purchase orders",
  },
  {
    key: "procurement.po.approve",
    module: "Procurement",
    description: "Approve purchase orders",
  },
  {
    key: "procurement.receive",
    module: "Procurement",
    description: "Record goods receipts against purchase orders",
  },

  {
    key: "finance.budget.manage",
    module: "Finance",
    description: "Set and track department budgets",
  },
  {
    key: "finance.invoice.verify",
    module: "Finance",
    description: "Enter and verify vendor invoices",
  },
  {
    key: "finance.invoice.approve",
    module: "Finance",
    description: "Approve verified invoices for payment",
  },
  {
    key: "finance.payment.manage",
    module: "Finance",
    description: "Record and manage payments",
  },

  {
    key: "maintenance.report",
    module: "Maintenance",
    description: "Report asset issues and track own tickets",
  },
  {
    key: "maintenance.manage",
    module: "Maintenance",
    description: "Assign, work on and close maintenance tickets",
  },

  {
    key: "reports.view",
    module: "Reports",
    description: "View authorized reports",
  },

  {
    key: "admin.roles.manage",
    module: "Administration",
    description: "Assign user roles and per-user permissions",
  },
  {
    key: "admin.workflow.manage",
    module: "Administration",
    description: "Configure approval workflows",
  },
  {
    key: "admin.master_data.manage",
    module: "Administration",
    description: "Manage categories, warehouses and other master data",
  },
  {
    key: "audit.view",
    module: "Administration",
    description: "View audit history",
  },
] as const;

export type PermissionKey = (typeof permissions)[number]["key"];

export const PERMISSION_KEYS: readonly PermissionKey[] = permissions.map(
  (p) => p.key,
);

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
