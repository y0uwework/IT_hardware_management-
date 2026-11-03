import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, qs, useApi } from "@/shared/client";

interface Row {
  id: number;
  movementType: string;
  quantity: number;
  reason: string | null;
  createdAt: string;
  category: { name: string };
  warehouse: { name: string };
  asset: { assetTag: string } | null;
  createdBy: { fullName: string };
}

export default function MovementsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const { data, meta, error, loading, reload } = useApi<Row[]>(
    router.isReady && !forbidden ? `/inventory/movements${qs({ search, page })}` : null
  );

  const columns: Column<Row>[] = [
    { key: "when", header: "When", render: (m) => formatDate(m.createdAt, true) },
    { key: "type", header: "Type", render: (m) => <span className="font-semibold">{m.movementType}</span> },
    {
      key: "what",
      header: "Item",
      render: (m) => (
        <span>
          {m.category.name}
          {m.asset && <span className="block font-mono text-neutral-500">{m.asset.assetTag}</span>}
        </span>
      ),
    },
    { key: "qty", header: "Qty", render: (m) => <span className="tabular-nums">{m.quantity}</span> },
    { key: "wh", header: "Warehouse", hideOnMobile: true, render: (m) => m.warehouse.name },
    { key: "reason", header: "Reason", hideOnMobile: true, render: (m) => m.reason ?? "—" },
    { key: "by", header: "By", hideOnMobile: true, render: (m) => m.createdBy.fullName },
  ];

  return (
    <MainLayout user={user} title="Stock movements" forbidden={forbidden}>
      <PageHeader title="Stock movements" subtitle="Every receipt, reservation, issue and return, in order." />
      <Card padded={false}>
        <div className="flex justify-end border-b border-neutral-200 p-4 sm:p-6">
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Category or asset tag" />
        </div>
        <DataTable columns={columns} rows={data} rowKey={(m) => m.id} loading={loading} error={error} onRetry={reload} emptyTitle="No movements yet" />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>
    </MainLayout>
  );
}
