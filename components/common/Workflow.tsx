// Small building blocks shared by the procurement, finance and maintenance screens.
import { useState } from "react";
import { api, ApiClientError } from "@/shared/client";

/** Label/value grid for detail pages. */
export function InfoGrid({ items, cols = 3 }: { items: [string, React.ReactNode][]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <dl className={`grid grid-cols-1 gap-5 ${grid}`}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="eyebrow">{k}</dt>
          <dd className="mt-1 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Headline number tile. */
export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "default" | "warning" | "error" | "success" }) {
  const color = { default: "text-neutral-900", warning: "text-amber-700", error: "text-error", success: "text-green-700" }[tone ?? "default"];
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-headline text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export type Flash = { tone: "success" | "error"; text: string } | null;

/**
 * POST/PUT helper with busy state, a flash message and field errors.
 * `run` resolves to the response data, or null when it failed (the error is in `flash`/`fieldErrors`).
 */
export function useMutation() {
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function run<T = unknown>(key: string, path: string, body: unknown = {}, method = "POST"): Promise<T | null> {
    setBusy(key);
    setFlash(null);
    setFieldErrors({});
    try {
      const r = await api<T>(path, { method, body });
      setFlash({ tone: "success", text: r.message });
      return r.data;
    } catch (e) {
      if (e instanceof ApiClientError) {
        setFlash({ tone: "error", text: e.message });
        setFieldErrors(e.fieldErrors);
      } else setFlash({ tone: "error", text: "Something went wrong" });
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { busy, flash, setFlash, fieldErrors, setFieldErrors, run };
}

/** Today's date as YYYY-MM-DD (local time), for date inputs. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const sum = (values: (number | string | null | undefined)[]) => values.reduce<number>((s, v) => s + (Number(v) || 0), 0);
