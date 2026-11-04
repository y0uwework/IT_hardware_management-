import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { toastSetter } from "@/components/common/Toast";
import { AssignModal } from "@/modules/assets/pages/components/AssignModal";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, formatDate, formatMoney, useApi } from "@/shared/client";
import { hasPermission } from "@/shared/permissions";
import { appConfig } from "@/shared/config/app.config";
import { ASSET_STATUS, RETURN_NEXT_STATUSES } from "@/shared/config/status.config";

interface AssetDetail {
  id: number;
  assetTag: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  specification: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  warrantyEndDate: string | null;
  condition: string;
  status: string;
  notes: string | null;
  createdAt: string;
  category: { id: number; name: string };
  warehouse: { id: number; name: string } | null;
  createdBy: { fullName: string };
  assignments: {
    id: number;
    isActive: boolean;
    assignedAt: string;
    acknowledgedAt: string | null;
    returnedAt: string | null;
    conditionAtIssue: string;
    conditionAtReturn: string | null;
    accessories: string | null;
    inspectionNotes: string | null;
    user: { id: number; fullName: string; employeeCode: string };
    issuedBy: { fullName: string };
    returnedTo: { fullName: string } | null;
    requestItem: { request: { id: number; requestNumber: string } } | null;
  }[];
  reservations: { id: number; requestItem: { id: number; request: { id: number; requestNumber: string; requester: { id: number; fullName: string } } } }[];
  movements: { id: number; movementType: string; quantity: number; reason: string | null; createdAt: string; createdBy: { fullName: string }; warehouse: { name: string } }[];
}

export default function AssetDetailPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: a, error, loading, reload } = useApi<AssetDetail>(router.isReady && !forbidden ? `/assets/${id}` : null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [ret, setRet] = useState({ condition: "Good", accessories: "", inspectionNotes: "", nextStatus: "Available", warehouseId: "" });
  const [busy, setBusy] = useState(false);
  const setMsg = toastSetter("error");
  const warehouses = useApi<{ id: number; name: string }[]>(returnOpen ? "/master-data/warehouses" : null);

  const active = a?.assignments.find((x) => x.isActive);
  const reservation = a?.reservations[0];

  async function submitReturn() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/assets/${id}/return`, {
        method: "POST",
        body: { ...ret, warehouseId: ret.warehouseId ? Number(ret.warehouseId) : null },
      });
      setReturnOpen(false);
      setMsg({ tone: "success", text: "Return processed. Assignment history is preserved." });
      await reload();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiClientError ? e.message : "Could not process the return" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <MainLayout user={user} title={a?.assetTag ?? "Asset"} forbidden={forbidden}>
      <PageHeader
        title={a ? a.assetTag : "Asset"}
        subtitle={a && <span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /> {[a.manufacturer, a.model].filter(Boolean).join(" ") || a.category.name}</span>}
        breadcrumbs={hasPermission(user, "asset.view.all") ? [{ label: "Asset register", href: "/assets" }, { label: a?.assetTag ?? "…" }] : [{ label: "My assets", href: "/assets/mine" }, { label: a?.assetTag ?? "…" }]}
        actions={
          a && (
            <>
              {a.status === ASSET_STATUS.ASSIGNED && hasPermission(user, "asset.return") && (
                <Button variant="secondary" onClick={() => setReturnOpen(true)}>
                  Process return
                </Button>
              )}
              {a.status === ASSET_STATUS.AVAILABLE && hasPermission(user, "asset.assign") && (
                <Button onClick={() => setAssignOpen(true)}>Issue asset</Button>
              )}
              {a.status === ASSET_STATUS.RESERVED && reservation && hasPermission(user, "asset.assign") && (
                <Button onClick={() => setAssignOpen(true)}>Issue to {reservation.requestItem.request.requester.fullName.split(" ")[0]}</Button>
              )}
            </>
          )
        }
      />
      {loading && !a && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {a && (
        <div className="flex flex-col gap-6">
          {reservation && (
            <Alert tone="info">
              Reserved for{" "}
              <Link className="font-semibold underline" href={`/requests/${reservation.requestItem.request.id}`}>
                {reservation.requestItem.request.requestNumber}
              </Link>{" "}
              ({reservation.requestItem.request.requester.fullName}).
            </Alert>
          )}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Details" className="xl:col-span-2">
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Category", a.category.name],
                  ["Serial number", a.serialNumber ?? "—"],
                  ["Condition", a.condition],
                  ["Warehouse", a.warehouse?.name ?? "—"],
                  ["Purchase date", formatDate(a.purchaseDate)],
                  ["Purchase cost", formatMoney(a.purchaseCost)],
                  ["Warranty ends", formatDate(a.warrantyEndDate)],
                  ["Registered", `${formatDate(a.createdAt)} by ${a.createdBy.fullName}`],
                ].map(([k, val]) => (
                  <div key={k}>
                    <dt className="eyebrow">{k}</dt>
                    <dd className="mt-1">{val}</dd>
                  </div>
                ))}
              </dl>
              {a.specification && (
                <div className="mt-6">
                  <p className="eyebrow">Specification</p>
                  <p className="mt-1 whitespace-pre-line">{a.specification}</p>
                </div>
              )}
              {a.notes && (
                <div className="mt-4">
                  <p className="eyebrow">Notes</p>
                  <p className="mt-1 whitespace-pre-line">{a.notes}</p>
                </div>
              )}
            </Card>
            <Card title="Current holder">
              {active ? (
                <div className="flex flex-col gap-1">
                  <p className="font-semibold">{active.user.fullName}</p>
                  <p className="text-body-sm text-neutral-500">{active.user.employeeCode}</p>
                  <p className="mt-2 text-body-sm">Issued {formatDate(active.assignedAt)} by {active.issuedBy.fullName}</p>
                  <p className={`text-body-sm ${active.acknowledgedAt ? "text-green-700" : "text-amber-700"}`}>
                    {active.acknowledgedAt ? `Acknowledged ${formatDate(active.acknowledgedAt)}` : "Awaiting acknowledgement"}
                  </p>
                  {active.accessories && <p className="text-body-sm text-neutral-600">Accessories: {active.accessories}</p>}
                </div>
              ) : (
                <p className="text-body-sm text-neutral-500">Not assigned.</p>
              )}
            </Card>
          </div>

          <Card title="Assignment history" padded={false}>
            {a.assignments.length === 0 ? (
              <p className="px-6 py-8 text-center text-body-sm text-neutral-500">Never assigned.</p>
            ) : (
              <ul>
                {a.assignments.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4 last:border-0 sm:px-6">
                    <span>
                      <span className="block font-semibold">{h.user.fullName}</span>
                      <span className="block text-body-sm text-neutral-500">
                        {formatDate(h.assignedAt)} → {h.returnedAt ? formatDate(h.returnedAt) : "present"}
                        {h.requestItem && (
                          <>
                            {" · "}
                            <Link href={`/requests/${h.requestItem.request.id}`} className="hover:underline">
                              {h.requestItem.request.requestNumber}
                            </Link>
                          </>
                        )}
                      </span>
                      {h.inspectionNotes && <span className="mt-1 block text-body-sm text-neutral-600">Inspection: {h.inspectionNotes}</span>}
                    </span>
                    <span className="text-right text-body-sm text-neutral-600">
                      Out: {h.conditionAtIssue}
                      {h.conditionAtReturn && <span className="block">In: {h.conditionAtReturn}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {hasPermission(user, "asset.view.all") && (
            <Card title="Movement history" padded={false}>
              <ul>
                {a.movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 text-body-sm last:border-0 sm:px-6">
                    <span>
                      <span className="font-semibold">{m.movementType}</span>
                      <span className="text-neutral-500"> · {m.warehouse.name}{m.reason ? ` · ${m.reason}` : ""}</span>
                    </span>
                    <span className="text-neutral-500">
                      {m.createdBy.fullName} · {formatDate(m.createdAt, true)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {a && assignOpen && (
        <AssignModal
          open
          onClose={() => setAssignOpen(false)}
          onDone={() => {
            setMsg({ tone: "success", text: "Asset issued. The employee has been asked to acknowledge receipt." });
            void reload();
          }}
          asset={a}
          fixedUser={reservation ? reservation.requestItem.request.requester : undefined}
          requestItemId={reservation?.requestItem.id}
        />
      )}

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title={`Return ${a?.assetTag ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReturnOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitReturn} loading={busy}>
              Process return
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label="Condition on return"
            value={ret.condition}
            onChange={(e) => setRet({ ...ret, condition: e.target.value })}
            options={appConfig.assetConditions.map((c) => ({ value: c, label: c }))}
          />
          <Select
            label="Next status"
            value={ret.nextStatus}
            onChange={(e) => setRet({ ...ret, nextStatus: e.target.value })}
            options={RETURN_NEXT_STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <Select
            label="Receiving warehouse"
            value={ret.warehouseId}
            onChange={(e) => setRet({ ...ret, warehouseId: e.target.value })}
            placeholder={a?.warehouse ? `Same as before (${a.warehouse.name})` : "Choose a warehouse"}
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
          />
          <Input label="Accessories returned" value={ret.accessories} onChange={(e) => setRet({ ...ret, accessories: e.target.value })} />
          <Textarea label="Inspection notes" value={ret.inspectionNotes} onChange={(e) => setRet({ ...ret, inspectionNotes: e.target.value })} rows={3} />
        </div>
      </Modal>
    </MainLayout>
  );
}
