import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState } from "./LoadingSpinner";
import { EmptyState, ErrorState } from "./States";
import type { PageMeta } from "@/lib/api-response";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Hide below the md breakpoint to keep tables readable on phones. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyMessage,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !rows) return <LoadingState />;
  if (!rows || rows.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} />;

  return (
    <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
      <table className="w-full border-collapse text-left text-body-sm">
        <thead>
          <tr className="border-b border-neutral-200">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`whitespace-nowrap px-4 py-3 text-overline uppercase text-neutral-500 ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-neutral-200 last:border-0 ${onRowClick ? "cursor-pointer hover:bg-neutral-50" : ""}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-3 align-middle ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className ?? ""}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.total <= meta.limit) return null;
  const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-body-sm text-neutral-600">
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="rounded-full p-2 hover:bg-neutral-100 disabled:opacity-40"
          onClick={() => onPage(meta.page - 1)}
          disabled={meta.page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="px-2">
          Page {meta.page} of {pages}
        </span>
        <button
          className="rounded-full p-2 hover:bg-neutral-100 disabled:opacity-40"
          onClick={() => onPage(meta.page + 1)}
          disabled={meta.page >= pages}
          aria-label="Next page"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </nav>
  );
}

/** Debounced search box. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 300);
    return () => clearTimeout(t);
  }, [local, value, onChange]);
  return (
    <div className="relative w-full sm:w-72">
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-md border-[1.5px] border-neutral-300 bg-white pl-10 pr-4 text-body placeholder:text-neutral-400 focus:border-primary focus:shadow-focus focus:outline-none"
      />
    </div>
  );
}

/** Pill filter chips. */
export function FilterChips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`h-[34px] rounded-full border-[1.5px] px-3.5 text-body-sm font-semibold transition-colors ${
              selected ? "border-primary bg-primary text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
