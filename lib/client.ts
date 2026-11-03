// Browser-side API helpers.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult, PageMeta } from "./api-response";

export class ApiClientError extends Error {
  readonly code: string;
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, code: string, errors: { path?: string; message: string }[] = []) {
    super(message);
    this.code = code;
    this.fieldErrors = Object.fromEntries(errors.filter((e) => e.path).map((e) => [e.path!, e.message]));
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ data: T; message: string; meta?: PageMeta }> {
  const res = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: options.body !== undefined || (options.method && options.method !== "GET") ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : options.method && options.method !== "GET" ? "{}" : undefined,
    credentials: "same-origin",
  });
  let json: ApiResult<T>;
  try {
    json = (await res.json()) as ApiResult<T>;
  } catch {
    throw new ApiClientError(`Unexpected server response (${res.status})`, "INTERNAL_ERROR");
  }
  if (!json.success) {
    if (json.code === "UNAUTHENTICATED" && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiClientError(json.message, json.code, json.errors);
  }
  return { data: json.data, message: json.message, meta: json.meta };
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** GET with loading / error state. `path === null` skips the request. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const r = await api<T>(path);
      if (id === seq.current) {
        setData(r.data);
        setMeta(r.meta);
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, meta, error, loading, reload: load };
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
