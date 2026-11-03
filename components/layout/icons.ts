import {
  BarChart3,
  Boxes,
  CheckCircle,
  ClipboardList,
  LayoutDashboard,
  Laptop,
  Package,
  Settings,
  ShoppingCart,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SidebarIcon } from "@/shared/config/sidebar.config";

/** Approved icon map. Config icon names resolve only through this table. */
export const sidebarIcons: Record<SidebarIcon, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  CheckCircle,
  Warehouse,
  Laptop,
  Boxes,
  Package,
  ShoppingCart,
  Wallet,
  Wrench,
  ChartBar: BarChart3,
  Settings,
};
