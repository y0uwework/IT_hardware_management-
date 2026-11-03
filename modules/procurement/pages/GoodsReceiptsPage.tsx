import { useState } from "react";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { ButtonLink } from "@/components/common/Button";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/common/DataTable";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, qs, useApi } from "@/shared/client";
import { PO_STATUS } from "@/shared/config/status.config";

interface Row {
  id: number;
  grnNumber: string;
  receivedDate: string;
  deliveryNote: string | null;
  acceptedUnits: number;
  rejectedUnits: number;
  purchaseOrder: { id: number; poNumber: string };
  vendor: { name: string };
  warehouse: { name: string };
  receivedBy: { fullName: string };
}

export default function GoodsReceiptsPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<Row[]>(forbidden ? null : `/goods-receipts${qs({ search, page })}`);

  const columns: Column<Row>[] = [
    { key: "grn", header: "GRN", render: (g) => <span className="font-mono">{g.grnNumber}</span> },
    {
      key: "po",
      header: "Purchase order",
      render: (g) => (
        <span>
          <span className="block font-mono">{g.purchaseOrder.poNumber}</span>
          <span className="block text-neutral-500">{g.vendor.name}</span>
        </span>
      ),
    },
    { key: "date", header: "Received", hideOnMobile: true, render: (g) => formatDate(g.receivedDate) },
    { key: "wh", header: "Warehouse", hideOnMobile: true, render: (g) => g.warehouse.name },
    { key: "dn", header: "Delivery note", hideOnMobile: true, render: (g) => g.deliveryNote ?? "—" },
    {
      key: "units",
      header: "Units",
      render: (g) => (
        <span>
          {g.acceptedUnits} accepted{g.rejectedUnits ? <span className="text-error"> · {g.rejectedUnits} rejected</span> : null}
        </span>
      ),
    },
    { key: "by", header: "Received by", hideOnMobile: true, render: (g) => g.receivedBy.fullName },
  ];

  return (
    <MainLayout user={user} title="Goods receipts" forbidden={forbidden}>
      <PageHeader
        title="Goods receipts"
        subtitle="Deliveries checked in against purchase orders. Serialized items become assets; the rest adds to stock."
        actions={
          <ButtonLink href={`/procurement/purchase-orders?status=${encodeURIComponent(PO_STATUS.SENT_TO_VENDOR)}`} variant="secondary">
            Orders awaiting delivery
          </ButtonLink>
        }
      />
      <Card padded={false}>
        <div className="flex justify-end border-b border-neutral-200 p-4 sm:p-6">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search GRN, PO, vendor" />
        </div>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(g) => g.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="Nothing received yet"
          emptyMessage="Receive goods from a purchase order page."
          onRowClick={(g) => void router.push(`/procurement/purchase-orders/${g.purchaseOrder.id}`)}
        />
        <Pagination meta={list.meta} onPage={setPage} />
      </Card>
    </MainLayout>
  );
}
