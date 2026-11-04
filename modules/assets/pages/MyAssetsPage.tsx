import Link from "next/link";
import { Laptop, Package } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { EmptyState, ErrorState } from "@/components/common/States";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, useApi } from "@/shared/client";
import type { Handover } from "@/modules/handovers/handovers.types";
import { AcknowledgeButton, AcknowledgementBadge } from "@/modules/handovers/components/Acknowledge";

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className={mono ? "truncate font-mono" : undefined}>{children}</dd>
    </>
  );
}

function HandoverCard({ h, onChanged }: { h: Handover; onChanged: () => unknown }) {
  const Icon = h.kind === "asset" ? Laptop : Package;
  return (
    <li className="flex flex-col rounded-lg border border-neutral-200 bg-surface p-5 shadow-medium transition-all duration-200 hover:-translate-y-[3px] hover:shadow-large">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-neutral-100 p-3 text-neutral-700">
          <Icon size={22} aria-hidden="true" />
        </span>
        <AcknowledgementBadge acknowledgedAt={h.acknowledgedAt} />
      </div>
      <p className="eyebrow mt-4">{h.categoryName}</p>
      <h2 className="mt-1 font-headline text-lg font-semibold">
        {h.asset ? (
          <Link href={`/assets/${h.asset.id}`} className="hover:underline">
            {h.title}
          </Link>
        ) : (
          h.title
        )}
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
        {h.asset ? (
          <>
            <Field label="Asset tag" mono>
              {h.asset.assetTag}
            </Field>
            <Field label="Serial" mono>
              {h.asset.serialNumber ?? "—"}
            </Field>
          </>
        ) : (
          <>
            <Field label="Quantity">{h.quantity}</Field>
            {h.itemCode && (
              <Field label="Item code" mono>
                {h.itemCode}
              </Field>
            )}
          </>
        )}
        <Field label="Issued">{formatDate(h.issuedAt)}</Field>
        {h.asset && <Field label="Warranty">{formatDate(h.asset.warrantyEndDate)}</Field>}
        {h.warehouseName && <Field label="From">{h.warehouseName}</Field>}
        {h.accessories && <Field label="Accessories">{h.accessories}</Field>}
        {h.acknowledgedAt && <Field label="Acknowledged">{formatDate(h.acknowledgedAt)}</Field>}
        {h.request && (
          <Field label="Request" mono>
            <Link href={`/requests/${h.request.id}`} className="hover:underline">
              {h.request.requestNumber}
            </Link>
          </Field>
        )}
      </dl>
      {!h.acknowledgedAt && <AcknowledgeButton kind={h.kind} id={h.id} onDone={onChanged} className="mt-5" />}
    </li>
  );
}

export default function MyAssetsPage({ user, forbidden }: ProtectedPageProps) {
  const { data, error, loading, reload } = useApi<Handover[]>(forbidden ? null : "/handovers/mine");
  const assets = data?.filter((h) => h.kind === "asset") ?? [];
  const items = data?.filter((h) => h.kind === "stock") ?? [];

  return (
    <MainLayout user={user} title="My assets" forbidden={forbidden}>
      <PageHeader title="My assets" subtitle="Assets and items currently issued to you." />
      {loading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <div className="rounded-lg border border-neutral-200 bg-surface">
          <EmptyState title="No assets issued to you" message="When IT hands over an asset, it will appear here." />
        </div>
      )}
      {assets.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((h) => (
            <HandoverCard key={h.key} h={h} onChanged={reload} />
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <section aria-labelledby="issued-items" className={assets.length > 0 ? "mt-10" : undefined}>
          <h2 id="issued-items" className="font-headline text-subhead">
            Issued items
          </h2>
          <p className="mt-1 text-body-sm text-neutral-600">Accessories and consumables issued from stock. These have no asset tag.</p>
          <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((h) => (
              <HandoverCard key={h.key} h={h} onChanged={reload} />
            ))}
          </ul>
        </section>
      )}
    </MainLayout>
  );
}
