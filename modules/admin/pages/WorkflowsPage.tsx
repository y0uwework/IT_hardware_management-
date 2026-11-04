import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState } from "@/components/common/LoadingSpinner";
import { EmptyState, ErrorState } from "@/components/common/States";
import { toastSetter } from "@/components/common/Toast";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, formatDate, formatMoney, useApi } from "@/shared/client";
import { appConfig } from "@/shared/config/app.config";

interface Workflow {
  id: number;
  workflowKey: string;
  name: string;
  version: number;
  requestType: string | null;
  department: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  stages: { id: number; stageOrder: number; name: string; approverType: string; roleKey: string | null; dueDays: number }[];
  _count: { requests: number };
}

interface StageDraft {
  stageOrder: string;
  name: string;
  approverType: "MANAGER" | "ROLE";
  roleKey: string;
  dueDays: string;
}

interface Draft {
  workflowKey: string;
  name: string;
  requestType: string;
  department: string;
  minAmount: string;
  maxAmount: string;
  priority: string;
  stages: StageDraft[];
}

const blankStage = (order: number): StageDraft => ({ stageOrder: String(order), name: "", approverType: "MANAGER", roleKey: "", dueDays: "3" });

const blankDraft = (): Draft => ({
  workflowKey: "",
  name: "",
  requestType: "",
  department: "",
  minAmount: "",
  maxAmount: "",
  priority: "0",
  stages: [{ ...blankStage(1), name: "Reporting manager" }],
});

function fromWorkflow(w: Workflow): Draft {
  return {
    workflowKey: w.workflowKey,
    name: w.name,
    requestType: w.requestType ?? "",
    department: w.department ?? "",
    minAmount: w.minAmount ?? "",
    maxAmount: w.maxAmount ?? "",
    priority: String(w.priority),
    stages: w.stages.map((s) => ({
      stageOrder: String(s.stageOrder),
      name: s.name,
      approverType: s.approverType as "MANAGER" | "ROLE",
      roleKey: s.roleKey ?? "",
      dueDays: String(s.dueDays),
    })),
  };
}

export default function WorkflowsPage({ user, forbidden }: ProtectedPageProps) {
  const { data, error, loading, reload } = useApi<Workflow[]>(forbidden ? null : "/admin/workflows");
  const roles = useApi<{ key: string; name: string }[]>(forbidden ? null : "/admin/roles");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isNewKey, setIsNewKey] = useState(true);
  const [saving, setSaving] = useState(false);
  const setFormError = toastSetter("error");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const setMsg = toastSetter("success");

  const keys = Array.from(new Set((data ?? []).map((w) => w.workflowKey)));

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    setErrors({});
    try {
      const r = await api<{ version: number }>("/admin/workflows", {
        method: "POST",
        body: {
          workflowKey: draft.workflowKey,
          name: draft.name,
          requestType: draft.requestType || null,
          department: draft.department || null,
          minAmount: draft.minAmount === "" ? null : draft.minAmount,
          maxAmount: draft.maxAmount === "" ? null : draft.maxAmount,
          priority: draft.priority,
          stages: draft.stages.map((s) => ({ ...s, roleKey: s.approverType === "ROLE" && s.roleKey ? s.roleKey : null })),
        },
      });
      setMsg(`Saved ${draft.name} as version ${r.data.version}. Requests already in progress keep the version they started with.`);
      setDraft(null);
      await reload();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setFormError(e.message);
        setErrors(e.fieldErrors);
      } else setFormError("Could not save the workflow");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(w: Workflow, isActive: boolean) {
    await api(`/admin/workflows/${w.id}/active`, { method: "POST", body: { isActive } }).catch(() => undefined);
    await reload();
  }

  const setStage = (i: number, patch: Partial<StageDraft>) =>
    setDraft((d) => (d ? { ...d, stages: d.stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : d));

  return (
    <MainLayout user={user} title="Approval workflows" forbidden={forbidden}>
      <PageHeader
        title="Approval workflows"
        subtitle="Saving always creates a new version. Approval history is never rewritten."
        actions={
          <Button
            onClick={() => {
              setDraft(blankDraft());
              setIsNewKey(true);
            }}
          >
            <Plus size={18} aria-hidden="true" /> New workflow
          </Button>
        }
      />
      {loading && !data && <LoadingState />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <Card>
          <EmptyState title="No workflows configured" message="Requests cannot be submitted until at least one active workflow matches them." />
        </Card>
      )}
      <div className="flex flex-col gap-6">
        {keys.map((key) => {
          const versions = data!.filter((w) => w.workflowKey === key);
          const current = versions.find((w) => w.isActive) ?? versions[0];
          return (
            <Card
              key={key}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {current.name} <span className="font-mono text-body-sm font-normal text-neutral-500">{key}</span>
                </span>
              }
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDraft(fromWorkflow(current));
                    setIsNewKey(false);
                  }}
                >
                  Edit (new version)
                </Button>
              }
            >
              <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-body-sm text-neutral-600">
                <span>Request type: {current.requestType ?? "Any"}</span>
                <span>Department: {current.department ?? "Any"}</span>
                <span>
                  Amount: {current.minAmount ? formatMoney(current.minAmount) : "0"} – {current.maxAmount ? formatMoney(current.maxAmount) : "∞"}
                </span>
                <span>Priority: {current.priority}</span>
              </div>
              <ol className="flex flex-wrap items-center gap-2">
                {current.stages.length === 0 && <li className="text-body-sm text-neutral-500">No stages: requests are auto-approved.</li>}
                {current.stages.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    {i > 0 && <span className="text-neutral-400">{current.stages[i - 1].stageOrder === s.stageOrder ? "+" : "→"}</span>}
                    <span className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-body-sm">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="block text-caption font-normal text-neutral-500">
                        {s.approverType === "MANAGER" ? "Requester's manager" : roles.data?.find((r) => r.key === s.roleKey)?.name ?? s.roleKey} · {s.dueDays}d
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <details className="mt-5">
                <summary className="cursor-pointer text-body-sm font-semibold text-neutral-700">Versions ({versions.length})</summary>
                <ul className="mt-3 flex flex-col gap-2">
                  {versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
                      <span>
                        v{v.version} · {formatDate(v.createdAt)} · used by {v._count.requests} request(s)
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={v.isActive ? "Active" : "Inactive"} tone={v.isActive ? "success" : "neutral"} />
                        <Button variant="ghost" size="sm" onClick={() => setActive(v, !v.isActive)}>
                          {v.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={isNewKey ? "New workflow" : `New version of ${draft?.name}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save version
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Key"
                required
                value={draft.workflowKey}
                disabled={!isNewKey}
                onChange={(e) => setDraft({ ...draft, workflowKey: e.target.value })}
                helper="Stable identifier, e.g. standard-hardware"
                error={errors.workflowKey}
              />
              <Input label="Name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} error={errors.name} />
              <Select
                label="Request type"
                value={draft.requestType}
                onChange={(e) => setDraft({ ...draft, requestType: e.target.value })}
                placeholder="Any"
                options={appConfig.requestTypes.map((t) => ({ value: t, label: t }))}
              />
              <Input label="Department" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} placeholder="Any" />
              <Input label="Min amount" type="number" min={0} value={draft.minAmount} onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })} />
              <Input label="Max amount" type="number" min={0} value={draft.maxAmount} onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })} />
              <Input
                label="Priority"
                type="number"
                min={0}
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                helper="Higher wins when several workflows match"
              />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="eyebrow">Stages</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDraft({ ...draft, stages: [...draft.stages, blankStage(draft.stages.length + 1)] })}
                >
                  <Plus size={16} aria-hidden="true" /> Add stage
                </Button>
              </div>
              <p className="mb-3 text-caption font-normal text-neutral-500">Stages with the same order run in parallel and all must approve.</p>
              <div className="flex flex-col gap-3">
                {draft.stages.map((s, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 rounded-md border border-neutral-200 p-3 md:grid-cols-12">
                    <Input label="Order" type="number" min={1} value={s.stageOrder} onChange={(e) => setStage(i, { stageOrder: e.target.value })} wrapperClassName="md:col-span-2" />
                    <Input label="Name" value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} wrapperClassName="md:col-span-3" error={errors[`stages.${i}.name`]} />
                    <Select
                      label="Approver"
                      value={s.approverType}
                      onChange={(e) => setStage(i, { approverType: e.target.value as "MANAGER" | "ROLE" })}
                      options={[
                        { value: "MANAGER", label: "Requester's manager" },
                        { value: "ROLE", label: "Role" },
                      ]}
                      wrapperClassName="md:col-span-3"
                    />
                    <Select
                      label="Role"
                      value={s.roleKey}
                      disabled={s.approverType !== "ROLE"}
                      onChange={(e) => setStage(i, { roleKey: e.target.value })}
                      placeholder="—"
                      options={(roles.data ?? []).map((r) => ({ value: r.key, label: r.name }))}
                      wrapperClassName="md:col-span-2"
                    />
                    <Input label="Due (days)" type="number" min={1} value={s.dueDays} onChange={(e) => setStage(i, { dueDays: e.target.value })} wrapperClassName="md:col-span-1" />
                    <div className="flex items-end md:col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-3"
                        aria-label={`Remove stage ${i + 1}`}
                        onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, idx) => idx !== i) })}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
