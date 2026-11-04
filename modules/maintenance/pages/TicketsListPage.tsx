import { useState } from "react";
import { useRouter } from "next/router";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useMutation } from "@/components/common/Workflow";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, qs, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";
import { appConfig } from "@/shared/config/app.config";
import { MAINTENANCE_STATUS } from "@/shared/config/status.config";

interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  priority: string;
  severity: string;
  status: string;
  slaDueAt: string;
  slaBreached: boolean;
  isRepeat: boolean;
  createdAt: string;
  reportedBy: { fullName: string; department: string | null };
  assignedTo: { fullName: string } | null;
  asset: { id: number; assetTag: string; model: string | null } | null;
}
type Scope = "mine" | "assigned" | "all";

export default function MaintenancePage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const manage = hasPermission(user, "maintenance.manage");
  const [scope, setScope] = useState<Scope>(manage ? "all" : "mine");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const overdue = status === "overdue";
  const list = useApi<Ticket[]>(forbidden ? null : `/maintenance-tickets${qs({ scope, status: overdue ? undefined : status, overdue: overdue || undefined, search, page })}`);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ assetId: "", title: "", description: "", issueCategory: appConfig.issueCategories[0] as string, priority: "Normal", severity: "Minor" });
  const myAssets = useApi<{ asset: { id: number; assetTag: string; model: string | null; manufacturer: string | null; category: { name: string } } }[]>(open ? "/assets/mine" : null);
  const [assetSearch, setAssetSearch] = useState("");
  const found = useApi<{ id: number; assetTag: string; model: string | null; status: string }[]>(open && manage && assetSearch.length >= 2 ? `/assets${qs({ search: assetSearch, limit: 20 })}` : null);
  const m = useMutation();

  async function create() {
    const r = await m.run<{ id: number }>("create", "/maintenance-tickets", form);
    if (r) void router.push(`/maintenance/${r.id}`);
  }

  const assetOptions = [
    ...(myAssets.data ?? []).map((a) => ({ value: a.asset.id, label: `${a.asset.assetTag} · ${[a.asset.manufacturer, a.asset.model].filter(Boolean).join(" ") || a.asset.category.name} (issued to me)` })),
    ...(found.data ?? []).filter((a) => !(myAssets.data ?? []).some((x) => x.asset.id === a.id)).map((a) => ({ value: a.id, label: `${a.assetTag} · ${a.model ?? ""} (${a.status})` })),
  ];

  const columns: Column<Ticket>[] = [
    {
      key: "t",
      header: "Ticket",
      render: (t) => (
        <span>
          <span className="block font-mono text-neutral-900">{t.ticketNumber}{t.isRepeat && <span className="ml-2 rounded bg-amber-100 px-1.5 text-caption text-amber-800">repeat</span>}</span>
          <span className="block max-w-xs truncate text-neutral-500">{t.title}</span>
        </span>
      ),
    },
    { key: "asset", header: "Asset", hideOnMobile: true, render: (t) => (t.asset ? <span className="font-mono">{t.asset.assetTag}</span> : "—") },
    ...(scope !== "mine" ? [{ key: "by", header: "Reported by", hideOnMobile: true, render: (t: Ticket) => t.reportedBy.fullName }] : []),
    { key: "prio", header: "Priority", hideOnMobile: true, render: (t) => `${t.priority} · ${t.severity}` },
    { key: "tech", header: "Technician", hideOnMobile: true, render: (t) => t.assignedTo?.fullName ?? "—" },
    {
      key: "sla",
      header: "SLA due",
      hideOnMobile: true,
      render: (t) => {
        const done = t.status === MAINTENANCE_STATUS.RESOLVED || t.status === MAINTENANCE_STATUS.CLOSED;
        return <span className={t.slaBreached ? "font-semibold text-error" : ""}>{formatDate(t.slaDueAt, true)}{t.slaBreached ? (done ? " · missed" : " · overdue") : ""}</span>;
      },
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
  ];

  const scopes: { value: Scope; label: string }[] = manage
    ? [{ value: "all", label: "All tickets" }, { value: "assigned", label: "Assigned to me" }, { value: "mine", label: "Reported by me" }]
    : [];

  return (
    <MainLayout user={user} title="Maintenance" forbidden={forbidden}>
      <PageHeader
        title="Maintenance"
        subtitle={manage ? "Asset issues: assign, repair, track SLA and close." : "Report a problem with your asset and follow the repair."}
        actions={
          <Button onClick={() => { m.setFlash(null); m.setFieldErrors({}); setForm({ assetId: "", title: "", description: "", issueCategory: appConfig.issueCategories[0], priority: "Normal", severity: "Minor" }); setOpen(true); }}>
            <Plus size={18} aria-hidden="true" /> Report an issue
          </Button>
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {scopes.length ? <FilterChips options={scopes} value={scope} onChange={(v) => { setScope(v); setPage(1); }} /> : <span />}
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search ticket, asset, title" />
          </div>
          <FilterChips
            options={[{ value: "", label: "Any status" }, ...Object.values(MAINTENANCE_STATUS).map((s) => ({ value: s, label: s })), { value: "overdue", label: "Overdue" }]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(t) => t.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No tickets"
          emptyMessage={scope === "mine" ? "Nothing reported. Use “Report an issue” if something isn't working." : "Nothing matches these filters."}
          onRowClick={(t) => void router.push(`/maintenance/${t.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Report an asset issue"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={!!m.busy}>Cancel</Button>
            <Button onClick={create} loading={!!m.busy}>Submit</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {manage && (
            <Input label="Find any asset by tag or serial" value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Type at least 2 characters" />
          )}
          <Select
            label="Asset"
            value={form.assetId}
            placeholder={myAssets.loading ? "Loading…" : "Not about a specific asset"}
            options={assetOptions}
            onChange={(e) => setForm({ ...form, assetId: e.target.value })}
            error={m.fieldErrors.assetId}
          />
          <Input label="What's wrong?" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={m.fieldErrors.title} placeholder="e.g. Laptop does not charge" maxLength={200} />
          <Textarea label="Details" required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={m.fieldErrors.description} helper="When it started, what you've tried, any error messages." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select label="Type" value={form.issueCategory} options={appConfig.issueCategories.map((c) => ({ value: c, label: c }))} onChange={(e) => setForm({ ...form, issueCategory: e.target.value })} />
            <Select label="Priority" value={form.priority} options={appConfig.priorities.map((p) => ({ value: p, label: `${p} (fix within ${appConfig.maintenanceSlaHours[p]}h)` }))} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            <Select label="Impact" value={form.severity} options={appConfig.severities.map((s) => ({ value: s, label: s }))} onChange={(e) => setForm({ ...form, severity: e.target.value })} />
          </div>
        </div>
      </Modal>
    </MainLayout>
  );
}
