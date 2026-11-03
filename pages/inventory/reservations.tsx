import Link from "next/link";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, qs, useApi } from "@/lib/client";
import { RESERVATION_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth("inventory.view");

interface Row {
  id: number;
  quantity: number;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  category: { name: string };
  warehouse: { name: string };
  asset: { id: number; assetTag: string } | null;
  requestItem: { id: number; request: { id: number; requestNumber: string; requester: { fullName: string } } };
}

export default function ReservationsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const status = typeof router.query.status === "string" ? router.query.status : RESERVATION_STATUS.ACTIVE;
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const { data, meta, error, loading, reload } = useApi<Row[]>(
    router.isReady && !forbidden ? `/inventory/reservations${qs({ status: status === "all" ? "" : status, search, page })}` : null
  );

  const columns: Column<Row>[] = [
    {
      key: "req",
      header: "Request",
      render: (r) => (
        <Link href={`/requests/${r.requestItem.request.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          <span className="block font-mono">{r.requestItem.request.requestNumber}</span>
          <span className="block text-neutral-500">{r.requestItem.request.requester.fullName}</span>
        </Link>
      ),
    },
    {
      key: "what",
      header: "Reserved",
      render: (r) =>
        r.asset ? (
          <Link href={`/assets/${r.asset.id}`} className="font-mono hover:underline">
            {r.asset.assetTag}
          </Link>
        ) : (
          `${r.quantity} × ${r.category.name}`
        ),
    },
    { key: "wh", header: "Warehouse", hideOnMobile: true, render: (r) => r.warehouse.name },
    { key: "created", header: "Reserved on", hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
    {
      key: "exp",
      header: "Expires",
      hideOnMobile: true,
      render: (r) => {
        const overdue = r.status === "Active" && r.expiresAt && new Date(r.expiresAt) < new Date();
        return <span className={overdue ? "font-semibold text-error" : ""}>{formatDate(r.expiresAt)}</span>;
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <MainLayout user={user} title="Reservations" forbidden={forbidden}>
      <PageHeader title="Stock reservations" subtitle="Stock held for approved requests. Release or issue from the request page." />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <FilterChips
            options={[
              { value: RESERVATION_STATUS.ACTIVE, label: "Active" },
              { value: RESERVATION_STATUS.CONSUMED, label: "Issued" },
              { value: RESERVATION_STATUS.RELEASED, label: "Released" },
              { value: "all", label: "All" },
            ]}
            value={status}
            onChange={(v) => setQuery({ status: v })}
          />
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Request or asset tag" />
        </div>
        <DataTable columns={columns} rows={data} rowKey={(r) => r.id} loading={loading} error={error} onRetry={reload} emptyTitle="No reservations" />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>
    </MainLayout>
  );
}
