import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, formatMoney, qs, useApi } from "@/shared/client";
import { PR_STATUS } from "@/shared/config/status.config";

interface Row {
  id: number;
  prNumber: string;
  title: string;
  status: string;
  department: string | null;
  requiredDate: string | null;
  createdAt: string;
  lineCount: number;
  quotationCount: number;
  estimatedValue: string | null;
  createdBy: { fullName: string };
}
interface PendingLine {
  requestItemId: number;
  requestId: number;
  requestNumber: string;
  requesterName: string;
  department: string | null;
  categoryName: string;
  itemCode: string | null;
  itemName: string | null;
  specification: string;
  estimatedUnitPrice: string | null;
  outstanding: number;
}

export default function RequisitionsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<Row[]>(forbidden ? null : `/purchase-requisitions${qs({ status, search, page })}`);
  const pending = useApi<PendingLine[]>(forbidden ? null : "/purchase-requisitions/pending-lines");

  function start(ids: number[] = []) {
    const query = ids.length ? `?requestItemIds=${ids.join(",")}` : "";
    void router.push(`/procurement/requisitions/create${query}`);
  }

  const columns: Column<Row>[] = [
    {
      key: "pr",
      header: "Requisition",
      render: (r) => (
        <span>
          <span className="block font-mono text-neutral-900">{r.prNumber}</span>
          <span className="block max-w-xs truncate text-neutral-500">{r.title}</span>
        </span>
      ),
    },
    { key: "dept", header: "Department", hideOnMobile: true, render: (r) => r.department ?? "—" },
    { key: "lines", header: "Lines", hideOnMobile: true, render: (r) => r.lineCount },
    { key: "quotes", header: "Quotes", hideOnMobile: true, render: (r) => r.quotationCount },
    { key: "value", header: "Est. value", hideOnMobile: true, render: (r) => formatMoney(r.estimatedValue) },
    { key: "date", header: "Created", hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  const pendingCount = pending.data?.length ?? 0;

  return (
    <MainLayout user={user} title="Purchase requisitions" forbidden={forbidden}>
      <PageHeader
        title="Purchase requisitions"
        subtitle="Collect what needs buying, gather vendor quotations and pick the best offer."
        actions={
          <Button onClick={() => start()}>
            <Plus size={18} aria-hidden="true" /> New requisition
          </Button>
        }
      />

      {pendingCount > 0 && (
        <Card
          className="mb-6"
          padded={false}
          title={`Waiting to be procured (${pendingCount})`}
          actions={
            <Button size="sm" onClick={() => start(pending.data!.map((p) => p.requestItemId))}>
              Requisition all
            </Button>
          }
        >
          <ul>
            {pending.data!.map((p) => (
              <li key={p.requestItemId} className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {p.outstanding} × {p.itemName ?? p.categoryName}
                    {p.itemCode && <span className="ml-2 font-mono text-caption font-normal text-neutral-500">{p.itemCode}</span>}
                  </span>
                  <span className="block truncate text-body-sm text-neutral-500">
                    <Link className="hover:underline" href={`/requests/${p.requestId}`}>{p.requestNumber}</Link> · {p.requesterName}
                    {p.department && ` · ${p.department}`} · {p.specification}
                  </span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => start([p.requestItemId])}>Requisition</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            options={[{ value: "", label: "All" }, ...Object.values(PR_STATUS).map((s) => ({ value: s, label: s }))]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search number, title" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(r) => r.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No requisitions yet"
          emptyMessage="When IT marks request items for procurement they appear above, ready to requisition."
          onRowClick={(r) => void router.push(`/procurement/requisitions/${r.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </MainLayout>
  );
}
