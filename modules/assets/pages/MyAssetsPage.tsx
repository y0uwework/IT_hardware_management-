import { useState } from "react";
import { Laptop } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Button } from "@/components/common/Button";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { EmptyState, ErrorState } from "@/components/common/States";
import { toastSetter } from "@/components/common/Toast";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, formatDate, useApi } from "@/shared/client";

interface Row {
  id: number;
  assignedAt: string;
  acknowledgedAt: string | null;
  conditionAtIssue: string;
  accessories: string | null;
  issuedBy: { fullName: string };
  asset: {
    id: number;
    assetTag: string;
    serialNumber: string | null;
    manufacturer: string | null;
    model: string | null;
    warrantyEndDate: string | null;
    category: { name: string };
  };
}

export default function MyAssetsPage({ user, forbidden }: ProtectedPageProps) {
  const { data, error, loading, reload } = useApi<Row[]>(forbidden ? null : "/assets/mine");
  const [busy, setBusy] = useState<number | null>(null);
  const setMsg = toastSetter("error");

  async function acknowledge(id: number) {
    setBusy(id);
    setMsg(null);
    try {
      await api(`/assignments/${id}/acknowledge`, { method: "POST" });
      setMsg({ tone: "success", text: "Thanks — receipt acknowledged." });
      await reload();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not acknowledge" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <MainLayout user={user} title="My assets" forbidden={forbidden}>
      <PageHeader title="My assets" subtitle="Assets currently issued to you." />
      {loading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <div className="rounded-lg border border-neutral-200 bg-surface">
          <EmptyState title="No assets issued to you" message="When IT hands over an asset, it will appear here." />
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((a) => (
            <li
              key={a.id}
              className="flex flex-col rounded-lg border border-neutral-200 bg-surface p-5 shadow-medium transition-all duration-200 hover:-translate-y-[3px] hover:shadow-large"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-md bg-neutral-100 p-3 text-neutral-700">
                  <Laptop size={22} aria-hidden="true" />
                </span>
                {a.acknowledgedAt ? (
                  <span className="rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-caption text-[#166534]">Acknowledged</span>
                ) : (
                  <span className="rounded-full bg-[#FEF9C3] px-2.5 py-0.5 text-caption text-[#854D0E]">Action needed</span>
                )}
              </div>
              <p className="eyebrow mt-4">{a.asset.category.name}</p>
              <h2 className="mt-1 font-headline text-lg font-semibold">
                {[a.asset.manufacturer, a.asset.model].filter(Boolean).join(" ") || a.asset.assetTag}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
                <dt className="text-neutral-500">Asset tag</dt>
                <dd className="font-mono">{a.asset.assetTag}</dd>
                <dt className="text-neutral-500">Serial</dt>
                <dd className="truncate font-mono">{a.asset.serialNumber ?? "—"}</dd>
                <dt className="text-neutral-500">Issued</dt>
                <dd>{formatDate(a.assignedAt)}</dd>
                <dt className="text-neutral-500">Warranty</dt>
                <dd>{formatDate(a.asset.warrantyEndDate)}</dd>
                {a.accessories && (
                  <>
                    <dt className="text-neutral-500">Accessories</dt>
                    <dd>{a.accessories}</dd>
                  </>
                )}
              </dl>
              {!a.acknowledgedAt && (
                <Button className="mt-5" onClick={() => acknowledge(a.id)} loading={busy === a.id}>
                  I received this
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </MainLayout>
  );
}
