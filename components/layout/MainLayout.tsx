import Head from "next/head";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AuthUser } from "@/shared/auth";
import { appConfig } from "@/shared/config/app.config";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ForbiddenState } from "../common/States";

const UserContext = createContext<AuthUser | null>(null);

/** Current user inside protected pages. */
export function useUser(): AuthUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useUser must be used inside MainLayout");
  return u;
}

export function MainLayout({
  user,
  title,
  forbidden,
  children,
}: {
  user: AuthUser;
  title: string;
  forbidden?: boolean;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <UserContext.Provider value={user}>
      <Head>
        <title>{`${title} · ${appConfig.shortName}`}</title>
      </Head>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-large">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <Sidebar permissions={user.permissions} open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={user} onMenu={() => setMenuOpen(true)} />
          <main id="main" className="mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            {forbidden ? <ForbiddenState /> : children}
          </main>
        </div>
      </div>
    </UserContext.Provider>
  );
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-body-sm text-neutral-500">
            {breadcrumbs.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {b.href ? (
                  <Link href={b.href} className="hover:text-neutral-900 hover:underline">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-neutral-700">
                    {b.label}
                  </span>
                )}
                {i < breadcrumbs.length - 1 && <ChevronRight size={14} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-headline text-[28px] font-bold leading-tight sm:text-[34px]">{title}</h1>
          {subtitle && <div className="mt-1.5 text-body text-neutral-600">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
