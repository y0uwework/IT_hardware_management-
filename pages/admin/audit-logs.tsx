import { useState } from "react";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Modal } from "@/components/common/Modal";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, qs, useApi } from "@/lib/client";

export const getServerSideProps = withPageAuth("audit.view");

interface Row {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  correlationId: string | null;
  createdAt: string;
  actor: { fullName: string; employeeCode: string } | null;
}

function pretty(json: string | null) {
  if (!json) return "—";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default function AuditLogsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });
  const { data, meta, error, loading, reload } = useApi<Row[]>(router.isReady && !forbidden ? `/admin/audit-logs${qs({ search, page })}` : null);
  const [open, setOpen] = useState<Row | null>(null);

  const columns: Column<Row>[] = [
    { key: "when", header: "When", render: (r) => formatDate(r.createdAt, true) },
    { key: "actor", header: "Actor", render: (r) => r.actor?.fullName ?? "System" },
    { key: "action", header: "Action", render: (r) => <span className="font-mono">{r.action}</span> },
    { key: "entity", header: "Entity", hideOnMobile: true, render: (r) => `${r.entityType} #${r.entityId}` },
  ];

  return (
    <MainLayout user={user} title="Audit logs" forbidden={forbidden}>
      <PageHeader title="Audit logs" subtitle="Who changed what, and when." />
      <Card padded={false}>
        <div className="flex justify-end border-b border-neutral-200 p-4 sm:p-6">
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Filter by action, e.g. asset." />
        </div>
        <DataTable columns={columns} rows={data} rowKey={(r) => r.id} loading={loading} error={error} onRetry={reload} emptyTitle="No audit records" onRowClick={setOpen} />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.action ?? ""} size="lg">
        {open && (
          <div className="flex flex-col gap-4 text-body-sm">
            <p>
              {open.actor?.fullName ?? "System"} · {formatDate(open.createdAt, true)} · {open.entityType} #{open.entityId}
            </p>
            {open.correlationId && <p className="font-mono text-neutral-500">Correlation: {open.correlationId}</p>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="eyebrow mb-2">Before</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-neutral-50 p-3 font-mono text-[12px]">{pretty(open.beforeJson)}</pre>
              </div>
              <div>
                <p className="eyebrow mb-2">After</p>
                <pre className="max-h-80 overflow-auto rounded-md bg-neutral-50 p-3 font-mono text-[12px]">{pretty(open.afterJson)}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
