import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Bell, LogOut, Menu } from "lucide-react";
import type { AuthUser } from "@/lib/auth";
import { api, formatDate, useApi } from "@/lib/client";

interface NotificationRow {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function Header({ user, onMenu }: { user: AuthUser; onMenu: () => void }) {
  const router = useRouter();
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifications = useApi<{ items: NotificationRow[]; unread: number }>("/notifications");
  const bellRef = useOutsideClose(bellOpen, () => setBellOpen(false));
  const userRef = useOutsideClose(userOpen, () => setUserOpen(false));

  const reloadNotifications = notifications.reload;
  useEffect(() => {
    const t = setInterval(() => void reloadNotifications(), 60_000);
    return () => clearInterval(t);
  }, [reloadNotifications]);

  async function openNotification(n: NotificationRow) {
    setBellOpen(false);
    if (!n.readAt) {
      await api("/notifications", { method: "POST", body: { id: n.id } }).catch(() => undefined);
      void notifications.reload();
    }
    if (n.link) void router.push(n.link);
  }

  async function markAll() {
    await api("/notifications", { method: "POST", body: { id: "all" } }).catch(() => undefined);
    void notifications.reload();
  }

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const unread = notifications.data?.unread ?? 0;
  const initials = user.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-neutral-200 bg-surface/95 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Open menu">
        <Menu size={22} />
      </button>
      <div className="flex-1" />

      <div className="relative" ref={bellRef}>
        <button
          onClick={() => setBellOpen((o) => !o)}
          className="relative rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          aria-expanded={bellOpen}
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        {bellOpen && (
          <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-surface shadow-large">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <span className="font-headline font-semibold">Notifications</span>
              {unread > 0 && (
                <button onClick={markAll} className="text-body-sm font-semibold text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {(notifications.data?.items ?? []).length === 0 && (
                <li className="px-4 py-8 text-center text-body-sm text-neutral-500">You&apos;re all caught up.</li>
              )}
              {notifications.data?.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNotification(n)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 ${
                      n.readAt ? "" : "bg-primary-tint/50"
                    }`}
                  >
                    <span className="text-body-sm font-semibold text-neutral-900">{n.title}</span>
                    {n.body && <span className="text-body-sm text-neutral-600">{n.body}</span>}
                    <span className="text-caption font-normal text-neutral-400">{formatDate(n.createdAt, true)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="relative" ref={userRef}>
        <button
          onClick={() => setUserOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 hover:bg-neutral-100"
          aria-expanded={userOpen}
          aria-label="Account menu"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-body-sm font-bold text-white">
            {initials}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-body-sm font-semibold leading-tight">{user.fullName}</span>
            <span className="block text-caption font-normal text-neutral-500">{user.designation ?? user.employeeCode}</span>
          </span>
        </button>
        {userOpen && (
          <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-neutral-200 bg-surface shadow-large">
            <div className="border-b border-neutral-200 px-4 py-3">
              <p className="text-body-sm font-semibold">{user.fullName}</p>
              <p className="text-caption font-normal text-neutral-500">
                {user.employeeCode}
                {user.department ? ` · ${user.department}` : ""}
              </p>
              {user.roles.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {user.roles.map((r) => (
                    <span key={r} className="rounded-sm bg-neutral-100 px-1.5 py-0.5 text-caption text-neutral-700">
                      {r}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <Link href="/assets/mine" className="block px-4 py-2.5 text-body-sm hover:bg-neutral-50" onClick={() => setUserOpen(false)}>
              My assets
            </Link>
            <button onClick={signOut} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-body-sm text-error hover:bg-red-50">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
