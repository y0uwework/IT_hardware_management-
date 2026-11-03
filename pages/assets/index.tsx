import { useRouter } from "next/router";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { ButtonLink } from "@/components/common/Button";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { Select } from "@/components/common/FormField";
import { StatusBadge } from "@/components/common/StatusBadge";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, qs, useApi } from "@/lib/client";
import { hasPermission } from "@/lib/permissions";
import { ASSET_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth("asset.view.all");

interface Row {
  id: number;
  assetTag: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
  warrantyEndDate: string | null;
  category: { name: string };
  warehouse: { name: string } | null;
  assignments: { user: { id: number; fullName: string }; acknowledgedAt: string | null }[];
}

export default function AssetRegisterPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const status = typeof router.query.status === "string" ? router.query.status : "";
  const search = typeof router.query.search === "string" ? router.query.search : "";
  const categoryId = typeof router.query.categoryId === "string" ? router.query.categoryId : "";
  const page = Number(router.query.page ?? 1) || 1;
  const setQuery = (patch: Record<string, string | number | undefined>) =>
    void router.replace({ query: { ...router.query, page: 1, ...patch } }, undefined, { shallow: true });

  const categories = useApi<{ id: number; name: string }[]>(forbidden ? null : "/master-data/categories");
  const { data, meta, error, loading, reload } = useApi<Row[]>(
    router.isReady && !forbidden ? `/assets${qs({ status, search, categoryId, page })}` : null
  );

  const columns: Column<Row>[] = [
    {
      key: "tag",
      header: "Asset",
      render: (a) => (
        <span>
          <span className="block font-mono text-neutral-900">{a.assetTag}</span>
          <span className="block text-neutral-500">{[a.manufacturer, a.model].filter(Boolean).join(" ") || a.category.name}</span>
        </span>
      ),
    },
    { key: "cat", header: "Category", hideOnMobile: true, render: (a) => a.category.name },
    { key: "serial", header: "Serial", hideOnMobile: true, render: (a) => <span className="font-mono">{a.serialNumber ?? "—"}</span> },
    {
      key: "holder",
      header: "Holder / location",
      hideOnMobile: true,
      render: (a) => a.assignments[0]?.user.fullName ?? a.warehouse?.name ?? "—",
    },
    { key: "warranty", header: "Warranty", hideOnMobile: true, render: (a) => formatDate(a.warrantyEndDate) },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <MainLayout user={user} title="Asset register" forbidden={forbidden}>
      <PageHeader
        title="Asset register"
        subtitle="Every serialized device and where it is."
        actions={
          hasPermission(user, "asset.create") && (
            <ButtonLink href="/assets/create">
              <Plus size={18} aria-hidden="true" /> Register asset
            </ButtonLink>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-end">
          <Select
            aria-label="Category"
            value={categoryId}
            onChange={(e) => setQuery({ categoryId: e.target.value || undefined })}
            placeholder="All categories"
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            wrapperClassName="lg:w-52"
          />
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setQuery({ status: e.target.value || undefined })}
            placeholder="All statuses"
            options={Object.values(ASSET_STATUS).map((s) => ({ value: s, label: s }))}
            wrapperClassName="lg:w-52"
          />
          <SearchInput value={search} onChange={(v) => setQuery({ search: v || undefined })} placeholder="Tag, serial or model" />
        </div>
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(a) => a.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="No assets found"
          onRowClick={(a) => void router.push(`/assets/${a.id}`)}
        />
        <Pagination meta={meta} onPage={(p) => setQuery({ page: p })} />
      </Card>
    </MainLayout>
  );
}
