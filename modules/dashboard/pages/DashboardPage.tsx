import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle, ClipboardList, Clock, Laptop, PackageCheck, Wrench } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card, StatCard } from "@/components/common/Card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { ErrorState } from "@/components/common/States";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatDate, useApi } from "@/shared/client";

interface Dashboard {
  myRequests?: {
    open: number;
    needsAction: number;
    recent: { id: number; requestNumber: string; purpose: string; status: string; createdAt: string }[];
  };
  myAssets?: { assigned: number; pendingAck: number };
  approvals?: { pending: number; overdue: number };
  itQueue?: { awaitingReview: number; inFulfilment: number; activeReservations: number };
  assetSummary?: { byStatus: Record<string, number>; warrantyExpiring: number };
  lowStock?: {
    quantityAvailable: number;
    quantityReserved: number;
    category: { name: string };
    warehouse: { name: string };
  }[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage({ user, forbidden }: ProtectedPageProps) {
  const { data, error, loading, reload } = useApi<Dashboard>(forbidden ? null : "/dashboard");

  return (
    <MainLayout user={user} title="Dashboard" forbidden={forbidden}>
      <PageHeader
        title={`${greeting()}, ${user.fullName.split(" ")[0]}`}
        subtitle="Here's what needs your attention today."
      />
      {loading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="flex flex-col gap-10">
          {(data.myRequests || data.myAssets || data.approvals) && (
            <section aria-labelledby="mine">
              <h2 id="mine" className="mb-4 font-headline text-subhead">
                Your work
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.myRequests && (
                  <>
                    <StatCard label="Open requests" value={data.myRequests.open} icon={ClipboardList} href="/requests" />
                    <StatCard
                      label="Need your action"
                      value={data.myRequests.needsAction}
                      hint="Drafts or returned for changes"
                      icon={AlertTriangle}
                      href="/requests"
                      accent={data.myRequests.needsAction ? "warning" : "neutral"}
                    />
                  </>
                )}
                {data.myAssets && (
                  <StatCard
                    label="My assets"
                    value={data.myAssets.assigned}
                    hint={data.myAssets.pendingAck ? `${data.myAssets.pendingAck} awaiting your acknowledgement` : "All acknowledged"}
                    icon={Laptop}
                    href="/assets/mine"
                    accent={data.myAssets.pendingAck ? "warning" : "neutral"}
                  />
                )}
                {data.approvals && (
                  <StatCard
                    label="Pending approvals"
                    value={data.approvals.pending}
                    hint={data.approvals.overdue ? `${data.approvals.overdue} overdue` : "None overdue"}
                    icon={CheckCircle}
                    href="/approvals"
                    accent={data.approvals.overdue ? "error" : data.approvals.pending ? "warning" : "neutral"}
                  />
                )}
              </div>
            </section>
          )}

          {(data.itQueue || data.assetSummary) && (
            <section aria-labelledby="it">
              <h2 id="it" className="mb-4 font-headline text-subhead">
                IT operations
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.itQueue && (
                  <>
                    <StatCard
                      label="Awaiting IT review"
                      value={data.itQueue.awaitingReview}
                      icon={Clock}
                      href="/requests?scope=it-queue&status=Approved"
                      accent={data.itQueue.awaitingReview ? "warning" : "neutral"}
                    />
                    <StatCard label="In fulfilment" value={data.itQueue.inFulfilment} icon={Wrench} href="/requests?scope=it-queue" />
                    <StatCard
                      label="Active reservations"
                      value={data.itQueue.activeReservations}
                      icon={PackageCheck}
                      href="/inventory/reservations"
                    />
                  </>
                )}
                {data.assetSummary && (
                  <StatCard
                    label="Assets available"
                    value={data.assetSummary.byStatus["Available"] ?? 0}
                    hint={
                      data.assetSummary.warrantyExpiring
                        ? `${data.assetSummary.warrantyExpiring} warranties expire within 60 days`
                        : `${data.assetSummary.byStatus["Assigned"] ?? 0} assigned`
                    }
                    icon={Boxes}
                    href="/assets?status=Available"
                  />
                )}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {data.myRequests && (
              <Card title="Recent requests" actions={<Link href="/requests" className="text-body-sm font-semibold text-primary hover:underline">View all</Link>} padded={false}>
                {data.myRequests.recent.length === 0 ? (
                  <p className="px-6 py-10 text-center text-body-sm text-neutral-500">You haven&apos;t made any requests yet.</p>
                ) : (
                  <ul>
                    {data.myRequests.recent.map((r) => (
                      <li key={r.id} className="border-b border-neutral-200 last:border-0">
                        <Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-neutral-50">
                          <span className="min-w-0">
                            <span className="block font-mono text-body-sm text-neutral-900">{r.requestNumber}</span>
                            <span className="block truncate text-body-sm text-neutral-500">{r.purpose}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <StatusBadge status={r.status} />
                            <span className="text-caption font-normal text-neutral-400">{formatDate(r.createdAt)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {data.lowStock && (
              <Card title="Low stock" actions={<Link href="/inventory" className="text-body-sm font-semibold text-primary hover:underline">Inventory</Link>} padded={false}>
                {data.lowStock.length === 0 ? (
                  <p className="px-6 py-10 text-center text-body-sm text-neutral-500">Stock levels look healthy.</p>
                ) : (
                  <ul>
                    {data.lowStock.map((s, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-3.5 last:border-0">
                        <span>
                          <span className="block text-body-sm font-semibold">{s.category.name}</span>
                          <span className="block text-caption font-normal text-neutral-500">{s.warehouse.name}</span>
                        </span>
                        <span className={`text-body-sm font-bold ${s.quantityAvailable === 0 ? "text-error" : "text-amber-600"}`}>
                          {s.quantityAvailable} available
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
