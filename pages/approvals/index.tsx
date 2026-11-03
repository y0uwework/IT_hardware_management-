import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, qs, useApi } from "@/lib/client";

export const getServerSideProps = withPageAuth("request.approve");

interface Row {
  id: number;
  status: string;
  dueAt: string | null;
  actedAt: string | null;
  createdAt: string;
  stage: { name: string };
  request: {
    id: number;
    requestNumber: string;
    requestType: string;
    priority: string;
    status: string;
    submittedAt: string | null;
    requester: { fullName: string; department: string | null };
    _count: { items: number };
  };
}

type Tab = "Pending" | "";

export default function ApprovalsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const tab: Tab = router.query.tab === "all" ? "" : "Pending";
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const { data, meta, error, loading, reload } = useApi<Row[]>(
    router.isReady && !forbidden ? `/approvals${qs({ status: tab, search, page })}` : null
  );

  const columns: Column<Row>[] = [
    {
      key: "req",
      header: "Request",
      render: (t) => (
        <span>
          <span className="block font-mono text-neutral-900">{t.request.requestNumber}</span>
          <span className="block text-neutral-500">
            {t.request.requester.fullName}
            {t.request.requester.department ? ` · ${t.request.requester.department}` : ""}
          </span>
        </span>
      ),
    },
    { key: "stage", header: "Stage", hideOnMobile: true, render: (t) => t.stage.name },
    { key: "type", header: "Type", hideOnMobile: true, render: (t) => `${t.request.requestType} · ${t.request._count.items} item(s)` },
    { key: "priority", header: "Priority", hideOnMobile: true, render: (t) => t.request.priority },
    {
      key: "due",
      header: tab === "Pending" ? "Due" : "Acted",
      hideOnMobile: true,
      render: (t) => {
        if (t.status !== "Pending") return formatDate(t.actedAt);
        const overdue = t.dueAt && new Date(t.dueAt) < new Date();
        return <span className={overdue ? "font-semibold text-error" : ""}>{formatDate(t.dueAt)}</span>;
      },
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <MainLayout user={user} title="Approvals" forbidden={forbidden}>
      <PageHeader title="Approvals" subtitle="Requests waiting for your decision." />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <FilterChips
            options={[
              { value: "pending", label: "Pending" },
              { value: "all", label: "All my tasks" },
            ]}
            value={tab === "Pending" ? "pending" : "all"}
            onChange={(v) => setQuery({ tab: v === "all" ? "all" : undefined })}
          />
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Request number or name" />
        </div>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(t) => t.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle={tab === "Pending" ? "You're all caught up" : "No approval tasks yet"}
          emptyMessage={tab === "Pending" ? "New approval requests will appear here." : undefined}
          onRowClick={(t) => void router.push(`/approvals/${t.id}`)}
        />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>
    </MainLayout>
  );
}
