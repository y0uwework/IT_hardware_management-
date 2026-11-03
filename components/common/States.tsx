import { AlertTriangle, Inbox, ShieldX } from "lucide-react";
import { Button } from "./Button";

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <span className="rounded-full bg-neutral-100 p-4 text-neutral-500">
        <Inbox size={28} aria-hidden="true" />
      </span>
      <h3 className="font-headline text-lg font-semibold">{title}</h3>
      {message && <p className="max-w-md text-body-sm text-neutral-500">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="rounded-full bg-red-50 p-4 text-error">
        <AlertTriangle size={28} aria-hidden="true" />
      </span>
      <p className="max-w-md text-body-sm text-neutral-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
      <span className="rounded-full bg-red-50 p-4 text-error">
        <ShieldX size={32} aria-hidden="true" />
      </span>
      <h2 className="font-headline text-subhead">Access denied</h2>
      <p className="max-w-md text-body text-neutral-600">
        You don&apos;t have permission to view this page. If you need access, ask your administrator to update your role.
      </p>
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const cls = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-green-200 bg-green-50 text-green-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-body-sm ${cls}`}>
      {children}
    </div>
  );
}
