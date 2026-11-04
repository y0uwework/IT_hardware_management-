// App-wide toast notifications. Render <Toaster /> once (pages/_app.tsx), then call
// toast.success("Saved") / toast.error("...") from anywhere — no provider or hook needed.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastTone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

/** How long each tone stays on screen (ms). Errors linger so they can be read. */
const DURATION: Record<ToastTone, number> = { success: 4000, info: 5000, warning: 7000, error: 8000 };
const MAX_VISIBLE = 4;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l(items);
}

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  items = items.filter((i) => i.id !== id);
  emit();
}

function show(tone: ToastTone, text: string): number {
  // Same message already showing → restart its timer instead of stacking a duplicate.
  const existing = items.find((i) => i.tone === tone && i.text === text);
  if (existing) {
    clearTimeout(timers.get(existing.id));
    timers.set(existing.id, setTimeout(() => dismissToast(existing.id), DURATION[tone]));
    return existing.id;
  }
  const id = nextId++;
  items = [...items, { id, tone, text }];
  while (items.length > MAX_VISIBLE) dismissToast(items[0].id);
  timers.set(id, setTimeout(() => dismissToast(id), DURATION[tone]));
  emit();
  return id;
}

export const toast = {
  success: (text: string) => show("success", text),
  error: (text: string) => show("error", text),
  info: (text: string) => show("info", text),
  warning: (text: string) => show("warning", text),
  show,
  dismiss: dismissToast,
};

export type ToastMessage = string | { tone: ToastTone; text: string } | null | undefined;

const setterCache = new Map<ToastTone, (m: ToastMessage) => void>();

/**
 * Drop-in replacement for a `useState` message setter: `setError("x")` or
 * `setMsg({ tone: "success", text: "x" })` shows a toast; `null` does nothing.
 * Returns a stable function, safe to use in effect/callback deps.
 */
export function toastSetter(defaultTone: ToastTone = "error"): (m: ToastMessage) => void {
  let fn = setterCache.get(defaultTone);
  if (!fn) {
    fn = (m: ToastMessage) => {
      if (!m) return;
      if (typeof m === "string") show(defaultTone, m);
      else show(m.tone, m.text);
    };
    setterCache.set(defaultTone, fn);
  }
  return fn;
}

const STYLE: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  success: { box: "border-green-200 bg-green-50 text-green-800", icon: <CheckCircle2 size={18} aria-hidden="true" /> },
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: <XCircle size={18} aria-hidden="true" /> },
  info: { box: "border-blue-200 bg-blue-50 text-blue-800", icon: <Info size={18} aria-hidden="true" /> },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: <AlertTriangle size={18} aria-hidden="true" /> },
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setList);
    setList(items);
    return () => {
      listeners.delete(setList);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-md border px-4 py-3 text-body-sm shadow-lg ${STYLE[t.tone].box}`}
        >
          <span className="mt-0.5 shrink-0">{STYLE[t.tone].icon}</span>
          <p className="min-w-0 flex-1 break-words">{t.text}</p>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="-m-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            aria-label="Dismiss notification"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
