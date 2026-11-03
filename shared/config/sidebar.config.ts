import type { PermissionKey } from "./permissions.config";

// Icon names must be keys of the approved icon map in components/layout/icons.ts.
export type SidebarIcon =
  | "LayoutDashboard"
  | "ClipboardList"
  | "CheckCircle"
  | "Warehouse"
  | "Laptop"
  | "Boxes"
  | "Package"
  | "ShoppingCart"
  | "Wallet"
  | "Wrench"
  | "ChartBar"
  | "Settings";

export interface SidebarItem {
  label: string;
  route: string;
  icon: SidebarIcon;
  /** Shown when the user holds this permission (or any of them, for a list). */
  permission: PermissionKey | PermissionKey[];
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
    label: "Item Master",
    route: "/masters/items",
    icon: "Package",
    permission: "item.view",
    // More masters go here; the sub-menu appears once there are two or more.
    children: [
      {
        label: "Item Master",
        route: "/masters/items",
        permission: "item.view",
      },
    ],
  },
  {
    label: "Procurement",
    route: "/procurement/requisitions",
    icon: "ShoppingCart",
    permission: ["procurement.manage", "procurement.po.approve", "procurement.receive"],
    children: [
      { label: "Requisitions", route: "/procurement/requisitions", permission: "procurement.manage" },
      { label: "Quotations", route: "/procurement/quotations", permission: "procurement.manage" },
      {
        label: "Purchase Orders",
        route: "/procurement/purchase-orders",
        permission: ["procurement.manage", "procurement.po.approve", "procurement.receive"],
      },
      { label: "Goods Receipts", route: "/procurement/goods-receipts", permission: ["procurement.manage", "procurement.receive"] },
      { label: "Vendors", route: "/procurement/vendors", permission: "procurement.manage" },
    ],
  },
  {
    label: "Finance",
    route: "/finance/invoices",
    icon: "Wallet",
    permission: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage", "finance.budget.manage"],
    children: [
      {
        label: "Invoices",
        route: "/finance/invoices",
        permission: ["finance.invoice.verify", "finance.invoice.approve", "finance.payment.manage"],
      },
      { label: "Payments", route: "/finance/payments", permission: ["finance.payment.manage", "finance.invoice.approve"] },
      { label: "Budgets", route: "/finance/budgets", permission: "finance.budget.manage" },
    ],
  },
  {
    label: "Maintenance",
    route: "/maintenance",
    icon: "Wrench",
    permission: ["maintenance.report", "maintenance.manage"],
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
