import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { Alert, ErrorState } from "@/components/common/States";
import { InfoGrid, Stat, useMutation } from "@/components/common/Workflow";
import { withPageAuth, type ProtectedPageProps } from "@/lib/page-auth";
import { formatDate, formatMoney, useApi } from "@/lib/client";
import { hasPermission } from "@/lib/permissions";
import { ASSET_STATUS, MAINTENANCE_STATUS } from "@/config/status.config";

export const getServerSideProps = withPageAuth(["maintenance.report", "maintenance.manage"]);

interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  issueCategory: string;
  priority: string;
  severity: string;
  status: string;
  slaDueAt: string;
  slaBreached: boolean;
  assignedAt: string | null;
  diagnosis: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  isRepeat: boolean;
  assetTakenIn: boolean;
  createdAt: string;
  reportedByUserId: number;
  reportedBy: { fullName: string; department: string | null };
  assignedTo: { id: number; fullName: string } | null;
  asset: { id: number; assetTag: string; model: string | null; status: string; categoryName: string; serialNumber: string | null } | null;
  activities: { id: number; activityType: string; description: string | null; hoursSpent: string | null; createdAt: string; actor: { fullName: string } }[];
  parts: { id: number; partName: string; quantity: number; unitCost: string; lineCost: string; vendor: { name: string } | null; item: { code: string } | null }[];
  partsCost: string;
  hoursSpent: number;
  assetHistory: { id: number; ticketNumber: string; title: string; status: string; createdAt: string }[];
}

type Dialog = "assign" | "progress" | "activity" | "part" | "resolve" | "close" | "reopen" | null;
const OPEN = [MAINTENANCE_STATUS.OPEN, MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.WAITING_FOR_PARTS] as string[];

export default function TicketPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const id = Number(router.query.id);
  const { data: t, error, loading, reload } = useApi<Ticket>(router.isReady && !forbidden ? `/maintenance-tickets/${id}` : null);
  const manage = hasPermission(user, "maintenance.manage");
  const m = useMutation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const techs = useApi<{ id: number; fullName: string; openTickets: number }[]>(dialog === "assign" ? "/maintenance-tickets/technicians" : null);
  const vendors = useApi<{ id: number; name: string }[]>(dialog === "part" ? "/vendors/options" : null);
  const [f, setF] = useState<Record<string, string | boolean>>({});

  const isReporter = t?.reportedByUserId === user.id;
  const isOpen = t && OPEN.includes(t.status);

  function open(d: Dialog, init: Record<string, string | boolean> = {}) {
    m.setFlash(null);
    m.setFieldErrors({});
    setF(init);
    setDialog(d);
  }

  async function submit() {
    if (!dialog) return;
    const body: Record<string, unknown> = { ...f };
    if (dialog === "progress") body.takeAssetIn = !!f.takeAssetIn;
    if (await m.run(dialog, `/maintenance-tickets/${id}/${dialog}`, body)) {
      setDialog(null);
      void reload();
    }
  }

  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const err = m.fieldErrors;
  const TITLE: Record<Exclude<Dialog, null>, string> = {
    assign: "Assign technician",
    progress: "Update status",
    activity: "Log work",
    part: "Add spare part",
    resolve: "Resolve ticket",
    close: isReporter ? "Confirm it's fixed" : "Close ticket",
    reopen: "Reopen ticket",
  };

  return (
    <MainLayout user={user} title={t?.ticketNumber ?? "Ticket"} forbidden={forbidden}>
      <PageHeader
        title={t ? `${t.ticketNumber} · ${t.title}` : "Ticket"}
        subtitle={t && (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} /> {t.priority} priority · {t.severity}
            {t.isRepeat && <span className="rounded bg-amber-100 px-1.5 text-caption text-amber-800">repeat issue</span>}
          </span>
        )}
        breadcrumbs={[{ label: "Maintenance", href: "/maintenance" }, { label: t?.ticketNumber ?? "…" }]}
        actions={
          t && (
            <div className="flex flex-wrap gap-2">
              {manage && isOpen && <Button variant="ghost" onClick={() => open("assign", { assigneeUserId: t.assignedTo ? String(t.assignedTo.id) : "" })}>{t.assignedTo ? "Reassign" : "Assign"}</Button>}
              {manage && t.status !== MAINTENANCE_STATUS.OPEN && isOpen && (
                <Button variant="secondary" onClick={() => open("progress", { status: t.status === MAINTENANCE_STATUS.IN_PROGRESS ? MAINTENANCE_STATUS.WAITING_FOR_PARTS : MAINTENANCE_STATUS.IN_PROGRESS })}>Update status</Button>
              )}
              {manage && isOpen && <Button variant="secondary" onClick={() => open("activity", { activityType: "Diagnosis" })}>Log work</Button>}
              {manage && isOpen && <Button variant="secondary" onClick={() => open("part")}>Add part</Button>}
              {manage && isOpen && t.status !== MAINTENANCE_STATUS.OPEN && <Button onClick={() => open("resolve", { assetNextStatus: ASSET_STATUS.AVAILABLE })}>Resolve</Button>}
              {(isReporter || manage) && (t.status === MAINTENANCE_STATUS.RESOLVED || (manage && t.status === MAINTENANCE_STATUS.OPEN)) && (
                <Button onClick={() => open("close")}>{isReporter && t.status === MAINTENANCE_STATUS.RESOLVED ? "Confirm fixed" : "Close"}</Button>
              )}
              {(isReporter || manage) && (t.status === MAINTENANCE_STATUS.RESOLVED || t.status === MAINTENANCE_STATUS.CLOSED) && (
                <Button variant="ghost" onClick={() => open("reopen")}>Reopen</Button>
              )}
            </div>
          )
        }
      />
      {loading && !t && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {t && (
        <div className="flex flex-col gap-6">
          {m.flash && !dialog && <Alert tone={m.flash.tone}>{m.flash.text}</Alert>}
          {isReporter && t.status === MAINTENANCE_STATUS.RESOLVED && (
            <Alert tone="info">IT has marked this resolved. Confirm it&apos;s fixed, or reopen it if the problem is still there.</Alert>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="SLA due" value={formatDate(t.slaDueAt, true)} tone={t.slaBreached ? "error" : "default"} />
            <Stat label="SLA" value={t.slaBreached ? (isOpen ? "Overdue" : "Missed") : isOpen ? "On track" : "Met"} tone={t.slaBreached ? "error" : "success"} />
            <Stat label="Work logged" value={`${t.hoursSpent} h`} />
            <Stat label="Parts cost" value={formatMoney(t.partsCost)} />
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Issue" className="xl:col-span-2">
              <p className="whitespace-pre-line">{t.description}</p>
              <div className="mt-5">
                <InfoGrid
                  items={[
                    ["Type", t.issueCategory],
                    ["Reported by", `${t.reportedBy.fullName}${t.reportedBy.department ? `, ${t.reportedBy.department}` : ""}`],
                    ["Reported", formatDate(t.createdAt, true)],
                    ["Technician", t.assignedTo?.fullName],
                    ["Resolved", formatDate(t.resolvedAt, true)],
                    ["Closed", formatDate(t.closedAt, true)],
                  ]}
                />
              </div>
              {t.diagnosis && <div className="mt-5"><p className="eyebrow">Diagnosis</p><p className="mt-1 whitespace-pre-line">{t.diagnosis}</p></div>}
              {t.resolutionNotes && <div className="mt-4"><p className="eyebrow">Resolution</p><p className="mt-1 whitespace-pre-line">{t.resolutionNotes}</p></div>}
            </Card>
            <Card title="Asset">
              {t.asset ? (
                <div className="flex flex-col gap-1">
                  {manage || hasPermission(user, "asset.view") ? (
                    <Link className="font-mono font-semibold hover:underline" href={`/assets/${t.asset.id}`}>{t.asset.assetTag}</Link>
                  ) : (
                    <span className="font-mono font-semibold">{t.asset.assetTag}</span>
                  )}
                  <span className="text-body-sm">{t.asset.categoryName}{t.asset.model && ` · ${t.asset.model}`}</span>
                  {t.asset.serialNumber && <span className="font-mono text-caption text-neutral-500">S/N {t.asset.serialNumber}</span>}
                  <span className="mt-1"><StatusBadge status={t.asset.status} /></span>
                  {t.assetTakenIn && <span className="text-caption text-amber-700">In the repair store for this ticket.</span>}
                  {t.assetHistory.length > 0 && (
                    <div className="mt-3">
                      <p className="eyebrow">Other tickets on this asset</p>
                      <ul className="mt-1 text-body-sm">
                        {t.assetHistory.map((h) => (
                          <li key={h.id}><Link className="font-mono hover:underline" href={`/maintenance/${h.id}`}>{h.ticketNumber}</Link> · {formatDate(h.createdAt)} · {h.status}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-body-sm text-neutral-500">Not linked to an asset.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Activity" className="xl:col-span-2" padded={false}>
              <ol>
                {t.activities.map((a) => (
                  <li key={a.id} className="border-b border-neutral-200 px-4 py-3 last:border-0 sm:px-6">
                    <p className="font-semibold">
                      {a.activityType}
                      <span className="font-normal text-neutral-500"> · {a.actor.fullName} · {formatDate(a.createdAt, true)}{a.hoursSpent && Number(a.hoursSpent) > 0 ? ` · ${Number(a.hoursSpent)} h` : ""}</span>
                    </p>
                    {a.description && <p className="whitespace-pre-line text-body-sm text-neutral-700">{a.description}</p>}
                  </li>
                ))}
              </ol>
            </Card>
            <Card title="Spare parts" padded={false}>
              {t.parts.length === 0 ? (
                <p className="px-6 py-8 text-center text-body-sm text-neutral-500">None used.</p>
              ) : (
                <ul>
                  {t.parts.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 border-b border-neutral-200 px-4 py-3 last:border-0">
                      <span>
                        <span className="block">{p.quantity} × {p.partName}</span>
                        <span className="block text-caption text-neutral-500">{formatMoney(p.unitCost)} each{p.vendor && ` · ${p.vendor.name}`}</span>
                      </span>
                      <span className="font-semibold">{formatMoney(p.lineCost)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog ? TITLE[dialog] : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Back</Button>
            <Button onClick={submit} loading={!!m.busy}>{dialog ? TITLE[dialog] : ""}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {m.flash?.tone === "error" && <Alert>{m.flash.text}</Alert>}
          {dialog === "assign" && (
            <>
              <Select label="Technician" required value={String(f.assigneeUserId ?? "")} placeholder={techs.loading ? "Loading…" : "Choose a technician"} options={(techs.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.openTickets} open)` }))} onChange={set("assigneeUserId")} error={err.assigneeUserId} />
              <Textarea label="Note" rows={2} value={String(f.comments ?? "")} onChange={set("comments")} />
            </>
          )}
          {dialog === "progress" && t && (
            <>
              <Select label="Status" value={String(f.status)} options={[MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.WAITING_FOR_PARTS].map((s) => ({ value: s, label: s }))} onChange={set("status")} />
              {t.asset && !t.assetTakenIn && f.status === MAINTENANCE_STATUS.IN_PROGRESS && [ASSET_STATUS.AVAILABLE, ASSET_STATUS.DAMAGED].includes(t.asset.status as never) && (
                <Checkbox label="Take the asset into the repair store" description="Marks it Under Maintenance so it can't be issued until resolved." checked={!!f.takeAssetIn} onChange={(on) => setF((s) => ({ ...s, takeAssetIn: on }))} />
              )}
              <Textarea label="Note" rows={2} value={String(f.comments ?? "")} onChange={set("comments")} />
            </>
          )}
          {dialog === "activity" && (
            <>
              <Select label="Type" value={String(f.activityType)} options={["Diagnosis", "Repair", "Note"].map((s) => ({ value: s, label: s }))} onChange={set("activityType")} />
              <Textarea label="What was done / found" required rows={4} value={String(f.description ?? "")} onChange={set("description")} error={err.description} />
              <Input label="Hours spent" type="number" min={0} step="0.25" value={String(f.hoursSpent ?? "")} onChange={set("hoursSpent")} />
            </>
          )}
          {dialog === "part" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Part" required wrapperClassName="md:col-span-2" value={String(f.partName ?? "")} onChange={set("partName")} error={err.partName} placeholder="e.g. 65W USB-C charger" />
              <Input label="Quantity" type="number" min={1} required value={String(f.quantity ?? "1")} onChange={set("quantity")} error={err.quantity} />
              <Input label="Unit cost" type="number" min={0} step="0.01" required value={String(f.unitCost ?? "")} onChange={set("unitCost")} error={err.unitCost} />
              <Select label="Vendor" wrapperClassName="md:col-span-2" value={String(f.vendorId ?? "")} placeholder="From stock / not applicable" options={(vendors.data ?? []).map((v) => ({ value: v.id, label: v.name }))} onChange={set("vendorId")} />
            </div>
          )}
          {dialog === "resolve" && t && (
            <>
              <Textarea label="How was it fixed?" required rows={4} value={String(f.resolutionNotes ?? "")} onChange={set("resolutionNotes")} error={err.resolutionNotes} />
              {t.assetTakenIn && (
                <Select label="Asset goes back as" value={String(f.assetNextStatus)} options={[ASSET_STATUS.AVAILABLE, ASSET_STATUS.DAMAGED, ASSET_STATUS.RETIRED].map((s) => ({ value: s, label: s }))} onChange={set("assetNextStatus")} />
              )}
              <p className="text-caption text-neutral-500">The reporter is notified and asked to confirm the fix.</p>
            </>
          )}
          {dialog === "close" && <Textarea label="Comments" rows={2} value={String(f.comments ?? "")} onChange={set("comments")} />}
          {dialog === "reopen" && <Textarea label="What is still wrong?" required rows={3} value={String(f.reason ?? "")} onChange={set("reason")} error={err.reason} />}
        </div>
      </Modal>
    </MainLayout>
  );
}
