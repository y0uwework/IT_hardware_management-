import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ArrowDown, ArrowUp, Download, Play } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/FormField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { EmptyState, ErrorState } from "@/components/common/States";
import { toastSetter } from "@/components/common/Toast";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, formatDate, formatMoney, qs, useApi } from "@/shared/client";
import { downloadCsv } from "@/shared/download";

type ColumnType = "text" | "number" | "money" | "date" | "datetime" | "percent" | "status";
interface ReportMeta {
  key: string;
  title: string;
  group: string;
  description: string;
  filters: { dateRange?: string; department?: boolean };
  columns: { key: string; label: string; type?: ColumnType }[];
}
interface ReportResult extends ReportMeta {
  rows: Record<string, unknown>[];
  generatedAt: string;
}

const NUMERIC: ColumnType[] = ["number", "money", "percent"];
// Columns where a total makes sense (not averages / percentages / ages).
const NOT_SUMMED = /avg|pct|age|days|hours|price/i;

function display(v: unknown, type: ColumnType = "text") {
  if (v === null || v === undefined || v === "") return "—";
  switch (type) {
    case "money": return formatMoney(v as string);
    case "date": return formatDate(v as string);
    case "datetime": return formatDate(v as string, true);
    case "percent": return `${Number(v).toFixed(1)}%`;
    case "number": return Number(v).toLocaleString("en-IN");
    default: return String(v);
  }
}

function csvValue(v: unknown, type: ColumnType = "text") {
  if (v === null || v === undefined) return "";
  if (type === "date") return String(v).slice(0, 10);
  if (type === "datetime") return new Date(String(v)).toISOString().replace("T", " ").slice(0, 16);
  return String(v);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "This month", range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; } },
  { label: "Last 30 days", range: () => { const n = new Date(); return [iso(new Date(n.getTime() - 29 * 86_400_000)), iso(n)]; } },
  { label: "This FY", range: () => { const n = new Date(); const y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1; return [`${y}-04-01`, iso(n)]; } },
  { label: "All time", range: () => ["", ""] },
];

export default function ReportsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const reports = useApi<ReportMeta[]>(forbidden ? null : "/reports");
  const departments = useApi<string[]>(forbidden ? null : "/finance/departments");
  const [key, setKey] = useState<string>("");
  const [from, setFrom] = useState(PRESETS[2].range()[0]);
  const [to, setTo] = useState(PRESETS[2].range()[1]);
  const [department, setDepartment] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const setErr = toastSetter("error");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const meta = reports.data?.find((r) => r.key === key) ?? null;

  // Remember the chosen report in the URL (?r=key) so it can be bookmarked or shared.
  useEffect(() => {
    if (!reports.data?.length || key) return;
    const wanted = typeof router.query.r === "string" ? router.query.r : "";
    setKey(reports.data.some((r) => r.key === wanted) ? wanted : reports.data[0].key);
  }, [reports.data, router.query.r, key]);

  useEffect(() => {
    if (!meta) return;
    void router.replace({ query: { r: meta.key } }, undefined, { shallow: true });
    void run(meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.key]);

  async function run(m: ReportMeta | null = meta) {
    if (!m) return;
    setRunning(true);
    setErr(null);
    setSort(null);
    try {
      const r = await api<ReportResult>(`/reports/${m.key}${qs({ from: m.filters.dateRange ? from : undefined, to: m.filters.dateRange ? to : undefined, department: m.filters.department ? department : undefined })}`);
      setResult(r.data);
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Could not run the report");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  const rows = useMemo(() => {
    if (!result) return [];
    if (!sort) return result.rows;
    const col = result.columns.find((c) => c.key === sort.key);
    const numeric = col && NUMERIC.includes(col.type ?? "text");
    return [...result.rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (x == null) return 1;
      if (y == null) return -1;
      return (numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [result, sort]);

  const totals = useMemo(() => {
    if (!result || result.rows.length < 2) return null;
    const t: Record<string, number> = {};
    for (const c of result.columns) {
      if ((c.type === "number" || c.type === "money") && !NOT_SUMMED.test(c.key)) t[c.key] = result.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
    return Object.keys(t).length ? t : null;
  }, [result]);

  function exportCsv() {
    if (!result) return;
    const filters = [result.filters.dateRange && (from || to) ? `${from || "start"} to ${to || "today"}` : null, department && result.filters.department ? department : null].filter(Boolean).join(" ");
    downloadCsv(`${result.key}${filters ? `_${filters.replace(/\s+/g, "_")}` : ""}.csv`, [
      result.columns.map((c) => c.label),
      ...rows.map((r) => result.columns.map((c) => csvValue(r[c.key], c.type))),
    ]);
  }

  const groups = (reports.data ?? []).reduce<Record<string, ReportMeta[]>>((g, r) => ((g[r.group] ??= []).push(r), g), {});

  return (
    <MainLayout user={user} title="Reports" forbidden={forbidden}>
      <PageHeader title="Reports" subtitle="Operational and financial reports across requests, procurement, assets and maintenance. Export any report to CSV." />
      {reports.loading && !reports.data && <LoadingState />}
      {reports.error && <ErrorState message={reports.error} onRetry={reports.reload} />}
      {reports.data && reports.data.length === 0 && <EmptyState title="No reports available" message="Your access doesn't include any reports." />}
      {reports.data && reports.data.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Reports" className="flex flex-col gap-5">
            <Select
              aria-label="Choose report"
              wrapperClassName="lg:hidden"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              options={reports.data.map((r) => ({ value: r.key, label: `${r.group} · ${r.title}` }))}
            />
            {Object.entries(groups).map(([group, list]) => (
              <div key={group} className="hidden lg:block">
                <p className="eyebrow mb-1 px-3">{group}</p>
                <ul>
                  {list.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        onClick={() => setKey(r.key)}
                        aria-current={r.key === key ? "page" : undefined}
                        className={`w-full rounded-md px-3 py-2 text-left text-body-sm ${r.key === key ? "bg-primary-tint font-semibold text-primary" : "text-neutral-700 hover:bg-neutral-50"}`}
                      >
                        {r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            {meta && (
              <Card>
                <h2 className="font-headline text-lg font-semibold">{meta.title}</h2>
                <p className="text-body-sm text-neutral-600">{meta.description}</p>
                {(meta.filters.dateRange || meta.filters.department) && (
                  <div className="mt-4 flex flex-col gap-3">
                    {meta.filters.dateRange && (
                      <div className="flex flex-wrap gap-2">
                        {PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            className="h-[30px] rounded-full border-[1.5px] border-neutral-300 px-3 text-caption font-semibold text-neutral-700 hover:bg-neutral-100"
                            onClick={() => { const [f, t] = p.range(); setFrom(f); setTo(t); }}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      {meta.filters.dateRange && (
                        <>
                          <Input label={`${meta.filters.dateRange} from`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                          <Input label="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </>
                      )}
                      {meta.filters.department && (
                        <Select label="Department" value={department} placeholder="All departments" options={(departments.data ?? []).map((d) => ({ value: d, label: d }))} onChange={(e) => setDepartment(e.target.value)} wrapperClassName="sm:w-56" />
                      )}
                      <Button onClick={() => void run()} loading={running}>
                        <Play size={16} aria-hidden="true" /> Run
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {running && !result && <LoadingState />}
            {result && (
              <Card
                padded={false}
                title={`${result.rows.length} row${result.rows.length === 1 ? "" : "s"}`}
                actions={
                  <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!result.rows.length}>
                    <Download size={16} aria-hidden="true" /> Export CSV
                  </Button>
                }
              >
                {result.rows.length === 0 ? (
                  <EmptyState title="No data" message="Nothing matches these filters. Try a wider date range." />
                ) : (
                  <div className={`max-h-[70vh] overflow-auto ${running ? "opacity-60" : ""}`}>
                    <table className="w-full border-collapse text-left text-body-sm">
                      <thead className="sticky top-0 z-10 bg-surface">
                        <tr className="border-b border-neutral-200">
                          {result.columns.map((c) => {
                            const numeric = NUMERIC.includes(c.type ?? "text");
                            const active = sort?.key === c.key;
                            return (
                              <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 ${numeric ? "text-right" : ""}`}>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-overline uppercase text-neutral-500 hover:text-neutral-900"
                                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: numeric ? -1 : 1 }))}
                                >
                                  {c.label}
                                  {active && (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                </button>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50">
                            {result.columns.map((c) => (
                              <td key={c.key} className={`px-4 py-2.5 align-top ${NUMERIC.includes(c.type ?? "text") ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                                {c.type === "status" && r[c.key] ? <StatusBadge status={String(r[c.key])} /> : display(r[c.key], c.type)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {totals && (
                        <tfoot className="sticky bottom-0 bg-neutral-50">
                          <tr className="border-t-2 border-neutral-300 font-semibold">
                            {result.columns.map((c, i) => (
                              <td key={c.key} className={`px-4 py-2.5 ${NUMERIC.includes(c.type ?? "text") ? "text-right tabular-nums" : ""}`}>
                                {c.key in totals ? display(totals[c.key], c.type) : i === 0 ? "Total" : ""}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
                <p className="border-t border-neutral-200 px-4 py-2 text-caption text-neutral-500 sm:px-6">Generated {formatDate(result.generatedAt, true)}</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
