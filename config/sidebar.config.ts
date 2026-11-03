import type { PermissionKey } from "./permissions.config";

// Icon names must be keys of the approved icon map in components/layout/icons.ts.
export type SidebarIcon =
  | "LayoutDashboard"
  | "ClipboardList"
  | "CheckCircle"
  | "Warehouse"
  | "Laptop"
  | "Boxes"
  | "ShoppingCart"
  | "Wallet"
  | "Wrench"
  | "ChartBar"
  | "Settings";

export interface SidebarItem {
  label: string;
  route: string;
  icon: SidebarIcon;
  permission: PermissionKey;
  children?: Omit<SidebarItem, "icon" | "children">[];
}

export const sidebarConfig: SidebarItem[] = [
  {
    label: "Dashboard",
    route: "/dashboard",
    icon: "LayoutDashboard",
    permission: "dashboard.view",
  },
  {
    label: "Asset Requests",
    route: "/requests",
    icon: "ClipboardList",
    permission: "request.view",
  },
  {
    label: "Approvals",
    route: "/approvals",
    icon: "CheckCircle",
    permission: "request.approve",
  },
  {
    label: "Inventory",
    route: "/inventory",
    icon: "Warehouse",
    permission: "inventory.view",
    children: [
      { label: "Stock", route: "/inventory", permission: "inventory.view" },
      {
        label: "Reservations",
        route: "/inventory/reservations",
        permission: "inventory.view",
      },
      {
        label: "Movements",
        route: "/inventory/movements",
        permission: "inventory.view",
      },
    ],
  },
  {
    label: "Asset Register",
    route: "/assets",
    icon: "Boxes",
    permission: "asset.view.all",
  },
  {
    label: "Procurement",
    route: "/procurement/vendors",
    icon: "ShoppingCart",
    permission: "procurement.manage",
  },
  {
    label: "Finance",
    route: "/finance/invoices",
    icon: "Wallet",
    permission: "finance.invoice.verify",
  },
  {
    label: "Maintenance",
    route: "/maintenance",
    icon: "Wrench",
    permission: "maintenance.manage",
  },
  {
    label: "Reports",
    route: "/reports",
    icon: "ChartBar",
    permission: "reports.view",
  },
  {
    label: "Administration",
    route: "/admin/roles",
    icon: "Settings",
    permission: "admin.roles.manage",
    children: [
      {
        label: "Roles",
        route: "/admin/roles",
        permission: "admin.roles.manage",
      },
      {
        label: "Users & Access",
        route: "/admin/users",
        permission: "admin.roles.manage",
      },
      {
        label: "Workflows",
        route: "/admin/workflows",
        permission: "admin.workflow.manage",
      },
      {
        label: "Master Data",
        route: "/admin/master-data",
        permission: "admin.master_data.manage",
      },
      {
        label: "Audit Logs",
        route: "/admin/audit-logs",
        permission: "audit.view",
      },
    ],
  },
];
