import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function Card({
  title,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
          {title && <h2 className="font-headline text-lg font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-4 sm:p-6" : ""}>{children}</div>
    </section>
  );
}

/** Dashboard stat tile. Becomes a link when `href` is set. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  accent = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  accent?: "neutral" | "warning" | "error" | "success";
}) {
  const accentText = {
    neutral: "text-neutral-900",
    warning: "text-amber-600",
    error: "text-error",
    success: "text-green-600",
  }[accent];
  const body = (
    <div className="flex h-full items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-surface p-5 shadow-subtle transition-all duration-200 group-hover:-translate-y-[3px] group-hover:shadow-large">
      <div>
        <p className="eyebrow">{label}</p>
        <p className={`mt-2 font-headline text-3xl font-bold ${accentText}`}>{value}</p>
        {hint && <p className="mt-1 text-body-sm text-neutral-500">{hint}</p>}
      </div>
      {Icon && (
        <span className="rounded-md bg-neutral-100 p-2.5 text-neutral-600">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="group block rounded-lg focus-visible:shadow-focus">
      {body}
    </Link>
  ) : (
    body
  );
}
