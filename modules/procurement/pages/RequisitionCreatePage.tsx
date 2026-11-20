import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Plus, Trash2 } from "lucide-react";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/FormField";
import { today, useMutation } from "@/components/common/Workflow";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { formatMoney, qs, useApi } from "@/shared/client";
import { appConfig } from "@/shared/config/app.config";

interface UserOption {
  id: number;
  fullName: string;
  email: string | null;
  department: string | null;
}
interface ItemOption {
  id: number;
  code: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  standardCost: string | null;
  category: { name: string };
}
interface VendorOption {
  id: number;
  code: string;
  name: string;
}
interface WarehouseOption {
  id: number;
  name: string;
}
interface PendingLine {
  requestItemId: number;
  requestId: number;
  requestNumber: string;
  requesterName: string;
  department: string | null;
  categoryName: string;
  itemCode: string | null;
  itemName: string | null;
  specification: string;
  estimatedUnitPrice: string | null;
  outstanding: number;
}

type Line = {
  itemId: string;
  description: string;
  requiredDate: string;
  quantity: string;
  infoPrice: string;
  vendorId: string;
  quotedDate: string;
  quotedPrice: string;
  currency: string;
  uom: string;
  warehouseId: string;
  taxCode: string;
};

const emptyLine = (): Line => ({
  itemId: "",
  description: "",
  requiredDate: "",
  quantity: "1",
  infoPrice: "",
  vendorId: "",
  quotedDate: "",
  quotedPrice: "",
  currency: appConfig.currencies[0],
  uom: appConfig.unitsOfMeasure[0],
  warehouseId: "",
  taxCode: "18",
});

const lineTotal = (l: Line) =>
  (Number(l.quantity) || 0) *
  (Number(l.quotedPrice) || Number(l.infoPrice) || 0);
const cell =
  "h-9 w-full rounded-md border-[1.5px] border-neutral-300 bg-white px-2 text-body-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary focus:shadow-focus focus:outline-none";

function parseIds(value: string | string[] | undefined): number[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0),
    ),
  );
}

export default function RequisitionCreatePage({
  user,
  forbidden,
}: ProtectedPageProps) {
  const router = useRouter();
  const m = useMutation();

  const [h, setH] = useState({
    requesterType: appConfig.requesterTypes[0] as string,
    requesterUserId: "",
    requesterName: "",
    branch: "",
    department: "",
    series: appConfig.requisitionSeries[0] as string,
    validUntil: "",
    documentDate: today(),
    requiredDate: "",
    itemServiceType: "Item",
    summaryType: "",
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [picked, setPicked] = useState<number[] | null>(null);

  const users = useApi<UserOption[]>(
    forbidden ? null : `/users${qs({ activeOnly: "true", limit: 100 })}`,
  );
  const departments = useApi<string[]>(
    forbidden ? null : "/finance/departments",
  );
  const items = useApi<ItemOption[]>(forbidden ? null : "/items/options");
  const vendors = useApi<VendorOption[]>(forbidden ? null : "/vendors/options");
  const warehouses = useApi<WarehouseOption[]>(
    forbidden ? null : "/master-data/warehouses",
  );
  const pending = useApi<PendingLine[]>(
    picked === null ? null : "/purchase-requisitions/pending-lines",
  );

  const queryIds = useMemo(
    () => parseIds(router.query.requestItemIds),
    [router.query.requestItemIds],
  );
  useEffect(() => {
    if (router.isReady) setPicked(queryIds);
  }, [router.isReady, queryIds]);

  const pendingPicked = (pending.data ?? []).filter((p) =>
    (picked ?? []).includes(p.requestItemId),
  );

  const upd = (i: number, patch: Partial<Line>) =>
    setLines((s) => s.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function pickRequester(id: string) {
    const u = users.data?.find((x) => String(x.id) === id);
    setH((s) => ({
      ...s,
      requesterUserId: id,
      requesterName: u?.fullName ?? "",
      department: s.department || u?.department || "",
    }));
  }

  async function save() {
    const derivedTitle =
      [h.summaryType, h.requesterName].filter(Boolean).join(" — ") ||
      "Purchase request";
    const r = await m.run<{ id: number }>("create", "/purchase-requisitions", {
      title: derivedTitle.length >= 3 ? derivedTitle : "Purchase request",
      requesterType: h.requesterType,
      requesterUserId: h.requesterUserId || null,
      requesterName: h.requesterName || null,
      branch: h.branch || null,
      series: h.series || null,
      validUntil: h.validUntil || null,
      documentDate: h.documentDate || null,
      requiredDate: h.requiredDate || null,
      itemServiceType: h.itemServiceType,
      summaryType: h.summaryType || null,
      department: h.department || null,
      notes: null,
      requestItemIds: picked ?? [],
      lines: lines
        .filter((l) => l.itemId)
        .map((l) => ({
          itemId: Number(l.itemId),
          quantity: Number(l.quantity) || 1,
          description: l.description || null,
          estimatedUnitPrice: l.infoPrice || null,
          requiredDate: l.requiredDate || null,
          vendorId: l.vendorId || null,
          quotedDate: l.quotedDate || null,
          quotedPrice: l.quotedPrice || null,
          currency: l.currency || null,
          uom: l.uom || null,
          warehouseId: l.warehouseId || null,
          taxCode: l.taxCode || null,
          lineTotal: l.quotedPrice || l.infoPrice ? lineTotal(l) : null,
        })),
    });
    if (r) void router.push(`/procurement/requisitions/${r.id}`);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const e = m.fieldErrors;
  const canSave = pendingPicked.length > 0 || lines.some((l) => l.itemId);

  return (
    <MainLayout user={user} title="New purchase intent" forbidden={forbidden}>
      <PageHeader
        title="New purchase intent"
        subtitle="Raise a purchase request, then collect vendor quotations and pick the best offer."
        breadcrumbs={[
          { label: "Requisitions", href: "/procurement/requisitions" },
          { label: "New" },
        ]}
      />

      <div className="flex flex-col gap-6">
        <Card title="Header">
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Requester Type"
                  value={h.requesterType}
                  options={appConfig.requesterTypes.map((t) => ({
                    value: t,
                    label: t,
                  }))}
                  onChange={(ev) =>
                    setH({ ...h, requesterType: ev.target.value })
                  }
                />
                <Select
                  label="Requester"
                  value={h.requesterUserId}
                  placeholder="Choose a requester"
                  options={(users.data ?? []).map((u) => ({
                    value: u.id,
                    label: `${u.fullName}${u.email ? ` (${u.email})` : ""}`,
                  }))}
                  onChange={(ev) => pickRequester(ev.target.value)}
                />
                <Input
                  label="Requester Name"
                  readOnly
                  value={h.requesterName}
                  placeholder="Fills from the requester"
                />
                <Select
                  label="Branch"
                  value={h.branch}
                  placeholder="Choose a branch"
                  options={appConfig.branches.map((b) => ({
                    value: b,
                    label: b,
                  }))}
                  onChange={(ev) => setH({ ...h, branch: ev.target.value })}
                />
                <Select
                  label="Department"
                  value={h.department}
                  placeholder="Choose a department"
                  options={(departments.data ?? []).map((d) => ({
                    value: d,
                    label: d,
                  }))}
                  onChange={(ev) => setH({ ...h, department: ev.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Series"
                value={h.series}
                options={appConfig.requisitionSeries.map((s) => ({
                  value: s,
                  label: s,
                }))}
                onChange={(ev) => setH({ ...h, series: ev.target.value })}
              />
              <Input label="Document No." readOnly value="" placeholder="Auto-generated on save" />
              <Input
                label="Posting Date"
                readOnly
                value="Set automatically on submit"
              />
              <Input
                label="Valid Until"
                type="date"
                value={h.validUntil}
                onChange={(ev) => setH({ ...h, validUntil: ev.target.value })}
              />
              <Input
                label="Document Date"
                type="date"
                value={h.documentDate}
                onChange={(ev) => setH({ ...h, documentDate: ev.target.value })}
              />
              <Input
                label="Required Date"
                type="date"
                value={h.requiredDate}
                onChange={(ev) => setH({ ...h, requiredDate: ev.target.value })}
              />
            </div>
          </div>
        </Card>

        {pendingPicked.length > 0 && (
          <Card title={`From employee requests (${pendingPicked.length})`}>
            <ul className="flex flex-col gap-2">
              {pendingPicked.map((p) => (
                <li
                  key={p.requestItemId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2"
                >
                  <span className="min-w-0 text-body-sm">
                    <span className="block font-semibold">
                      {p.outstanding} × {p.itemName ?? p.categoryName}
                      {p.itemCode && (
                        <span className="ml-2 font-mono text-caption font-normal text-neutral-500">
                          {p.itemCode}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-neutral-500">
                      {p.requestNumber} · {p.requesterName}
                      {p.department && ` · ${p.department}`} · {p.specification}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${p.requestNumber} from this request`}
                    onClick={() =>
                      setPicked((s) =>
                        (s ?? []).filter((id) => id !== p.requestItemId),
                      )
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card padded={false}>
          <div className="border-b border-neutral-200 px-4 pt-2 sm:px-6">
            <div
              role="tablist"
              aria-label="Purchase request contents"
              className="flex gap-1"
            >
              <button
                role="tab"
                aria-selected="true"
                className="border-b-2 border-primary px-3 py-2.5 text-body-sm font-semibold text-primary"
              >
                Contents
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 border-b border-neutral-200 p-4 sm:grid-cols-2 sm:p-6">
            <Select
              label="Item/Service Type"
              value={h.itemServiceType}
              options={[
                { value: "Item", label: "Item" },
                { value: "Service", label: "Service" },
              ]}
              onChange={(ev) =>
                setH({ ...h, itemServiceType: ev.target.value })
              }
            />
            <Select
              label="Summary Type"
              value={h.summaryType}
              placeholder="Choose a summary type"
              options={appConfig.purchaseSummaryTypes.map((s) => ({
                value: s,
                label: s,
              }))}
              onChange={(ev) => setH({ ...h, summaryType: ev.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
            <h3 className="font-headline text-lg font-semibold">Lines</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLines((s) => [...s, emptyLine()])}
            >
              <Plus size={16} aria-hidden="true" /> Add line
            </Button>
          </div>
          {e.lines && (
            <p className="px-4 pt-2 text-caption text-error sm:px-6">
              {e.lines}
            </p>
          )}

          <div className="overflow-x-auto p-4 sm:p-6">
            <table className="w-full border-collapse text-left text-body-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  {[
                    ["#", "w-10"],
                    ["Item No.", "min-w-[190px]"],
                    ["Item Description", "min-w-[200px]"],
                    ["Required Date", "min-w-[150px]"],
                    ["Required Qty.", "min-w-[110px]"],
                    ["Info Price", "min-w-[110px]"],
                    ["Vendor", "min-w-[170px]"],
                    ["Quoted Date", "min-w-[150px]"],
                    ["Quoted Price", "min-w-[120px]"],
                    ["Currency", "min-w-[100px]"],
                    ["UoM", "min-w-[100px]"],
                    ["Warehouse", "min-w-[160px]"],
                    ["Tax Code", "min-w-[120px]"],
                    ["Line Total", "min-w-[120px]"],
                  ].map(([label, width], i) => (
                    <th
                      key={label}
                      scope="col"
                      className={`whitespace-nowrap px-1.5 pb-2 text-overline uppercase text-neutral-500 ${width} ${i === 0 ? "text-center" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="w-10 px-1.5 pb-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr
                    key={i}
                    className="border-b border-neutral-200 last:border-0"
                  >
                    <td className="px-1.5 py-2 text-center text-neutral-500">
                      {i + 1}
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        aria-label={`Item No. for line ${i + 1}`}
                        className={cell}
                        value={l.itemId}
                        onChange={(ev) => {
                          const o = items.data?.find(
                            (x) => String(x.id) === ev.target.value,
                          );
                          upd(i, {
                            itemId: ev.target.value,
                            description: o?.description
                              ? `${o.name} — ${o.description}`
                              : (o?.name ?? ""),
                            infoPrice: l.infoPrice || o?.standardCost || "",
                            uom: o?.unitOfMeasure || l.uom,
                          });
                        }}
                      >
                        <option value="">Choose an item</option>
                        {(items.data ?? []).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.code} · {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        aria-label={`Item Description for line ${i + 1}`}
                        className={cell}
                        value={l.description}
                        onChange={(ev) =>
                          upd(i, { description: ev.target.value })
                        }
                        placeholder="Item description"
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        aria-label={`Required Date for line ${i + 1}`}
                        type="date"
                        className={cell}
                        value={l.requiredDate}
                        onChange={(ev) =>
                          upd(i, { requiredDate: ev.target.value })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        aria-label={`Required Qty. for line ${i + 1}`}
                        type="number"
                        min={1}
                        className={cell}
                        value={l.quantity}
                        onChange={(ev) => upd(i, { quantity: ev.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        aria-label={`Info Price for line ${i + 1}`}
                        type="number"
                        min={0}
                        step="0.01"
                        className={cell}
                        value={l.infoPrice}
                        onChange={(ev) =>
                          upd(i, { infoPrice: ev.target.value })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        aria-label={`Vendor for line ${i + 1}`}
                        className={cell}
                        value={l.vendorId}
                        onChange={(ev) => upd(i, { vendorId: ev.target.value })}
                      >
                        <option value="">Choose a vendor</option>
                        {(vendors.data ?? []).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        aria-label={`Quoted Date for line ${i + 1}`}
                        type="date"
                        className={cell}
                        value={l.quotedDate}
                        onChange={(ev) =>
                          upd(i, { quotedDate: ev.target.value })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <input
                        aria-label={`Quoted Price for line ${i + 1}`}
                        type="number"
                        min={0}
                        step="0.01"
                        className={cell}
                        value={l.quotedPrice}
                        onChange={(ev) =>
                          upd(i, { quotedPrice: ev.target.value })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        aria-label={`Currency for line ${i + 1}`}
                        className={cell}
                        value={l.currency}
                        onChange={(ev) => upd(i, { currency: ev.target.value })}
                      >
                        {appConfig.currencies.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        aria-label={`UoM for line ${i + 1}`}
                        className={cell}
                        value={l.uom}
                        onChange={(ev) => upd(i, { uom: ev.target.value })}
                      >
                        {appConfig.unitsOfMeasure.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        aria-label={`Warehouse for line ${i + 1}`}
                        className={cell}
                        value={l.warehouseId}
                        onChange={(ev) =>
                          upd(i, { warehouseId: ev.target.value })
                        }
                      >
                        <option value="">Choose a warehouse</option>
                        {(warehouses.data ?? []).map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-2">
                      <select
                        aria-label={`Tax Code for line ${i + 1}`}
                        className={cell}
                        value={l.taxCode}
                        onChange={(ev) => upd(i, { taxCode: ev.target.value })}
                      >
                        <option value="">—</option>
                        {appConfig.taxRates.map((t) => (
                          <option key={t} value={String(t)}>
                            GST {t}%
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-1.5 py-2 text-right font-medium">
                      {lineTotal(l) ? formatMoney(lineTotal(l)) : "—"}
                    </td>
                    <td className="px-1.5 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        aria-label={`Remove line ${i + 1}`}
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((s) => s.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            disabled={!!m.busy}
          >
            Cancel
          </Button>
          <Button onClick={save} loading={!!m.busy} disabled={!canSave}>
            Create purchase request
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
