import { useRouter } from "next/router";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { ButtonLink } from "@/components/common/Button";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Select } from "@/components/common/FormField";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, qs, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";
import { REQUEST_STATUS } from "@/shared/config/status.config";

interface Row {
  id: number;
  requestNumber: string;
  requestType: string;
  purpose: string;
  priority: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  requester: { fullName: string; department: string | null };
  _count: { items: number };
}

interface MyAssetRow {
  id: number;
  assignedAt: string;
  acknowledgedAt: string | null;
  asset: {
    id: number;
    assetTag: string;
    serialNumber: string | null;
    manufacturer: string | null;
    model: string | null;
    category: { name: string };
  };
}

const myAssetColumns: Column<MyAssetRow>[] = [
  {
    key: "asset",
    header: "Asset",
    render: (a) => (
      <span>
        <span className="block text-neutral-900">
          {[a.asset.manufacturer, a.asset.model].filter(Boolean).join(" ") || a.asset.assetTag}
        </span>
        <span className="block text-neutral-500">{a.asset.category.name}</span>
      </span>
    ),
  },
  {
    key: "tag",
    header: "Asset tag",
    render: (a) => <span className="font-mono">{a.asset.assetTag}</span>,
  },
  {
    key: "serial",
    header: "Serial",
    hideOnMobile: true,
    render: (a) => <span className="font-mono">{a.asset.serialNumber ?? "—"}</span>,
  },
  {
    key: "issued",
    header: "Issued",
    hideOnMobile: true,
    render: (a) => formatDate(a.assignedAt),
  },
  {
    key: "ack",
    header: "Status",
    render: (a) =>
      a.acknowledgedAt ? (
        <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-caption text-[#166534]">Acknowledged</span>
      ) : (
        <span className="rounded-full bg-[#FEF9C3] px-2.5 py-0.5 text-caption text-[#854D0E]">Action needed</span>
      ),
  },
];

type Scope = "mine" | "my-assets" | "all" | "it-queue";

export default function RequestsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const canViewAssets = !forbidden && hasPermission(user, "asset.view");
  const scopes: { value: Scope; label: string }[] = [{ value: "mine", label: "My requests" }];
  if (canViewAssets) scopes.push({ value: "my-assets", label: "My assets" });
  if (hasPermission(user, "request.it_review")) scopes.push({ value: "it-queue", label: "IT queue" });
  if (hasPermission(user, "request.view.all")) scopes.push({ value: "all", label: "All requests" });

  const scope = (scopes.find((s) => s.value === router.query.scope)?.value ?? "mine") as Scope;
  const status = typeof router.query.status === "string" ? router.query.status : "";
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;

  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const showingAssets = scope === "my-assets";

  const { data, meta, error, loading, reload } = useApi<Row[]>(
    router.isReady && !forbidden && !showingAssets ? `/hardware-requests${qs({ scope, status, search, page })}` : null,
  );

  const myAssets = useApi<MyAssetRow[]>(router.isReady && showingAssets ? "/assets/mine" : null);

  const columns: Column<Row>[] = [
    {
      key: "number",
      header: "Request",
      render: (r) => (
        <span>
          <span className="block font-mono text-neutral-900">{r.requestNumber}</span>
          <span className="block max-w-xs truncate text-neutral-500">{r.purpose}</span>
        </span>
      ),
    },
    ...(scope !== "mine"
      ? [
          {
            key: "requester",
            header: "Requester",
            hideOnMobile: true,
            render: (r: Row) => (
              <span>
                <span className="block">{r.requester.fullName}</span>
                <span className="block text-neutral-500">{r.requester.department ?? "—"}</span>
              </span>
            ),
          },
        ]
      : []),
    { key: "type", header: "Type", hideOnMobile: true, render: (r) => r.requestType },
    { key: "items", header: "Items", hideOnMobile: true, render: (r) => r._count.items },
    { key: "priority", header: "Priority", hideOnMobile: true, render: (r) => r.priority },
    { key: "date", header: "Created", hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <MainLayout user={user} title="Asset requests" forbidden={forbidden}>
      <PageHeader
        title="Asset requests"
        subtitle="Track requests from submission to handover."
        actions={
          hasPermission(user, "request.create") && (
            <ButtonLink href="/requests/create">
              <Plus size={18} aria-hidden="true" /> New request
            </ButtonLink>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          {scopes.length > 1 ? (
            <FilterChips
              options={scopes}
              value={scope}
              onChange={(v) => setQuery({ scope: v, status: undefined, search: undefined })}
            />
          ) : (
            <span />
          )}
          {showingAssets ? (
            <ButtonLink href="/assets/mine" variant="ghost" size="sm">
              Acknowledge receipt
            </ButtonLink>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(e) => setQuery({ status: e.target.value || undefined })}
                placeholder="All statuses"
                options={Object.values(REQUEST_STATUS)
                  .filter((s) => s !== REQUEST_STATUS.SUBMITTED)
                  .map((s) => ({ value: s, label: s }))}
                wrapperClassName="sm:w-56"
              />
              <SearchInput
                value={search}
                onChange={(v) => setQuery({ search: v || undefined })}
                placeholder="Search requests"
              />
            </div>
          )}
        </div>
        {showingAssets ? (
          <DataTable
            columns={myAssetColumns}
            rows={myAssets.data}
            rowKey={(a) => a.id}
            loading={myAssets.loading}
            error={myAssets.error}
            onRetry={myAssets.reload}
            emptyTitle="No assets issued to you"
            emptyMessage="When IT hands over hardware, it will appear here."
            onRowClick={() => void router.push("/assets/mine")}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data}
              rowKey={(r) => r.id}
              loading={loading}
              error={error}
              onRetry={reload}
              emptyTitle="No requests found"
              emptyMessage={
                scope === "mine" ? "Create a request when you need new hardware." : "Try a different filter."
              }
              onRowClick={(r) => void router.push(`/requests/${r.id}`)}
            />
            <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
          </>
        )}
      </Card>
    </MainLayout>
  );
}
