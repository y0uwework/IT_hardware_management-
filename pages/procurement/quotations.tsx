import { useState } from "react";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { DataTable, FilterChips, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, formatMoney, qs, useApi } from "@/lib/client";
import { QUOTATION_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth("procurement.manage");

interface Row {
  id: number;
  quotationNumber: string;
  quoteDate: string;
  validUntil: string | null;
  status: string;
  totalAmount: string;
  deliveryDays: number | null;
  vendor: { name: string };
  requisition: { id: number; prNumber: string; title: string };
}

export default function QuotationsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<Row[]>(forbidden ? null : `/quotations${qs({ status, search, page })}`);

  const columns: Column<Row>[] = [
    { key: "no", header: "Quotation", render: (q) => <span className="font-mono">{q.quotationNumber}</span> },
    { key: "vendor", header: "Vendor", render: (q) => q.vendor.name },
    {
      key: "pr",
      header: "Requisition",
      hideOnMobile: true,
      render: (q) => (
        <span>
          <span className="block font-mono">{q.requisition.prNumber}</span>
          <span className="block max-w-xs truncate text-neutral-500">{q.requisition.title}</span>
        </span>
      ),
    },
    { key: "date", header: "Quoted", hideOnMobile: true, render: (q) => formatDate(q.quoteDate) },
    {
      key: "valid",
      header: "Valid until",
      hideOnMobile: true,
      render: (q) => {
        const expired = q.validUntil && new Date(q.validUntil) < new Date() && q.status !== QUOTATION_STATUS.SELECTED;
        return <span className={expired ? "text-error" : ""}>{formatDate(q.validUntil)}{expired ? " (expired)" : ""}</span>;
      },
    },
    { key: "delivery", header: "Delivery", hideOnMobile: true, render: (q) => (q.deliveryDays != null ? `${q.deliveryDays} days` : "—") },
    { key: "total", header: "Total", render: (q) => formatMoney(q.totalAmount) },
    { key: "status", header: "Status", render: (q) => <StatusBadge status={q.status} /> },
  ];

  return (
    <MainLayout user={user} title="Quotations" forbidden={forbidden}>
      <PageHeader title="Quotations" subtitle="Every vendor quotation received. Compare and select on the requisition page." />
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            options={[{ value: "", label: "All" }, ...Object.values(QUOTATION_STATUS).map((s) => ({ value: s, label: s }))]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
          />
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search number, vendor, PR" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(q) => q.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No quotations yet"
          emptyMessage="Record vendor quotations from a purchase requisition."
          onRowClick={(q) => void router.push(`/procurement/requisitions/${q.requisition.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </MainLayout>
  );
}
