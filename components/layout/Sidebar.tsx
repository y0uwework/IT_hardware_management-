import Link from "next/link";
import { useRouter } from "next/router";
import { HardDrive, X } from "lucide-react";
import { sidebarConfig } from "@/config/sidebar.config";
import { filterSidebar } from "@/lib/permissions";
import { appConfig } from "@/config/app.config";
import { sidebarIcons } from "./icons";

function isActive(pathname: string, route: string) {
  if (route === "/dashboard") return pathname.startsWith("/dashboard");
  if (route === "/assets") return pathname === "/assets" || /^\/assets\/(create|\[id\])/.test(pathname);
  if (route === "/inventory") return pathname === "/inventory";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function Sidebar({
  permissions,
  open,
  onClose,
}: {
  permissions: string[];
  open: boolean;
  onClose: () => void;
}) {
  const { pathname } = useRouter();
  const items = filterSidebar(sidebarConfig, { permissions });

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-neutral-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-neutral-200 bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-900 text-white">
              <HardDrive size={18} aria-hidden="true" />
            </span>
            <span className="font-headline text-lg font-bold leading-tight">
              {appConfig.shortName}
              <span className="block text-caption font-normal text-neutral-500">Asset Management</span>
            </span>
          </Link>
          <button onClick={onClose} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 lg:hidden" aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = sidebarIcons[item.icon];
              const active =
                isActive(pathname, item.route) || !!item.children?.some((c) => isActive(pathname, c.route));
              return (
                <li key={item.route}>
                  <Link
                    href={item.route}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-12 items-center gap-3.5 rounded-md px-4 text-body transition-colors ${
                      active ? "bg-primary-tint font-semibold text-primary" : "text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    <Icon size={22} aria-hidden="true" />
                    {item.label}
                  </Link>
                  {active && item.children && item.children.length > 1 && (
                    <ul className="mb-1 ml-9 mt-0.5 flex flex-col border-l border-neutral-200">
                      {item.children.map((c) => {
                        const childActive = isActive(pathname, c.route);
                        return (
                          <li key={c.route}>
                            <Link
                              href={c.route}
                              onClick={onClose}
                              aria-current={childActive ? "page" : undefined}
                              className={`block py-2 pl-4 text-body-sm ${
                                childActive ? "font-semibold text-primary" : "text-neutral-600 hover:text-neutral-900"
                              }`}
                            >
                              {c.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
