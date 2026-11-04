import { useState } from "react";
import { Plus } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { Stat, sum, useMutation } from "@/components/common/Workflow";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatMoney, useApi } from "@/shared/client";
import { fiscalYearOf } from "@/shared/config/app.config";

interface Budget {
  id: number;
  fiscalYear: string;
  department: string;
  costCentre: string;
  amount: string;
  committed: string;
  spent: string;
  notes: string | null;
}

function yearOptions() {
  const now = new Date();
  return [-2, -1, 0, 1].map((d) => fiscalYearOf(new Date(now.getFullYear() + d, now.getMonth(), 15)));
}

function Bar({ budget, committed, spent }: { budget: number; committed: number; spent: number }) {
  const pct = (n: number) => (budget > 0 ? Math.min(100, (n / budget) * 100) : n > 0 ? 100 : 0);
  const over = committed > budget;
  return (
    <div className="w-40">
      <div className="relative h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
        <div className={`absolute inset-y-0 left-0 ${over ? "bg-error/40" : "bg-amber-300"}`} style={{ width: `${pct(committed)}%` }} />
        <div className={`absolute inset-y-0 left-0 ${over ? "bg-error" : "bg-primary"}`} style={{ width: `${pct(spent)}%` }} />
      </div>
      <p className={`mt-1 text-caption ${over ? "font-semibold text-error" : "text-neutral-500"}`}>
        {budget > 0 ? `${Math.round((committed / budget) * 100)}% committed` : "No budget amount"}
      </p>
    </div>
  );
}

export default function BudgetsPage({ user, forbidden }: ProtectedPageProps) {
  const [fy, setFy] = useState(fiscalYearOf(new Date()));
  const list = useApi<Budget[]>(forbidden ? null : `/budgets?fiscalYear=${fy}`);
  const departments = useApi<string[]>(forbidden ? null : "/finance/departments");
  const [editing, setEditing] = useState<{ id: number | null; department: string; costCentre: string; amount: string; notes: string } | null>(null);
  const m = useMutation();

  async function save() {
    if (!editing) return;
    const body = { fiscalYear: fy, department: editing.department, costCentre: editing.costCentre, amount: editing.amount, notes: editing.notes };
    if (await m.run("save", editing.id ? `/budgets/${editing.id}` : "/budgets", body, editing.id ? "PUT" : "POST")) {
      setEditing(null);
      void list.reload();
    }
  }

  const rows = list.data ?? [];
  const totals = { budget: sum(rows.map((r) => r.amount)), committed: sum(rows.map((r) => r.committed)), spent: sum(rows.map((r) => r.spent)) };

  const columns: Column<Budget>[] = [
    {
      key: "dept",
      header: "Department",
      render: (b) => (
        <span>
          <span className="block font-semibold">{b.department}</span>
          <span className="block text-neutral-500">{b.costCentre || "All cost centres"}</span>
        </span>
      ),
    },
    { key: "budget", header: "Budget", render: (b) => formatMoney(b.amount) },
    { key: "committed", header: "Committed (POs)", hideOnMobile: true, render: (b) => formatMoney(b.committed) },
    { key: "spent", header: "Paid", hideOnMobile: true, render: (b) => formatMoney(b.spent) },
    {
      key: "left",
      header: "Remaining",
      render: (b) => {
        const left = Number(b.amount) - Number(b.committed);
        return <span className={left < 0 ? "font-semibold text-error" : ""}>{formatMoney(left)}</span>;
      },
    },
    { key: "bar", header: "Utilisation", hideOnMobile: true, render: (b) => <Bar budget={Number(b.amount)} committed={Number(b.committed)} spent={Number(b.spent)} /> },
  ];

  return (
    <MainLayout user={user} title="Budgets" forbidden={forbidden}>
      <PageHeader
        title="Budgets"
        subtitle="Department hardware budgets. Committed = approved purchase orders in the year; paid = payments made."
        actions={
          <div className="flex items-end gap-2">
            <Select aria-label="Fiscal year" value={fy} onChange={(e) => setFy(e.target.value)} options={yearOptions().map((y) => ({ value: y, label: `FY ${y}` }))} wrapperClassName="w-36" />
            <Button onClick={() => { m.setFlash(null); m.setFieldErrors({}); setEditing({ id: null, department: "", costCentre: "", amount: "", notes: "" }); }}>
              <Plus size={18} aria-hidden="true" /> Add budget
            </Button>
          </div>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Budget FY ${fy}`} value={formatMoney(totals.budget)} />
        <Stat label="Committed" value={formatMoney(totals.committed)} tone={totals.committed > totals.budget ? "error" : "default"} />
        <Stat label="Paid" value={formatMoney(totals.spent)} />
        <Stat label="Remaining" value={formatMoney(totals.budget - totals.committed)} tone={totals.budget - totals.committed < 0 ? "error" : "success"} />
      </div>
      <Card padded={false}>
        <DataTable
          columns={columns}
          rows={list.data}
          rowKey={(b) => b.id}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle={`No budgets for FY ${fy}`}
          emptyMessage="Add a budget per department to track hardware spend against it."
          onRowClick={(b) => { m.setFlash(null); m.setFieldErrors({}); setEditing({ id: b.id, department: b.department, costCentre: b.costCentre, amount: b.amount, notes: b.notes ?? "" }); }}
        />
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${editing?.id ? "Edit" : "Add"} budget — FY ${fy}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={!!m.busy}>Save</Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Select label="Department" required value={editing.department} placeholder="Choose a department" options={(departments.data ?? []).map((d) => ({ value: d, label: d }))} onChange={(e) => setEditing({ ...editing, department: e.target.value })} error={m.fieldErrors.department} />
            <Input label="Cost centre" value={editing.costCentre} onChange={(e) => setEditing({ ...editing, costCentre: e.target.value })} helper="Leave blank to budget the whole department." />
            <Input label="Amount" type="number" min={0} step="0.01" required value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} error={m.fieldErrors.amount} />
            <Textarea label="Notes" rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
