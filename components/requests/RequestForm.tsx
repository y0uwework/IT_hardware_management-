import { useState, type FormEvent } from "react";
import { useRouter } from "next/router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Card } from "@/components/common/Card";
import { Alert } from "@/components/common/States";
import { api, ApiClientError, formatMoney, useApi } from "@/lib/client";
import { appConfig } from "@/config/app.config";

export interface RequestFormValues {
  requestType: string;
  purpose: string;
  justification: string;
  priority: string;
  requiredDate: string;
  costCentre: string;
  items: { itemId: string; quantity: string; requestedSpecification: string; estimatedUnitPrice: string }[];
}

export const emptyItem = () => ({ itemId: "", quantity: "1", requestedSpecification: "", estimatedUnitPrice: "" });

export const emptyRequest = (): RequestFormValues => ({
  requestType: appConfig.requestTypes[0],
  purpose: "",
  justification: "",
  priority: "Normal",
  requiredDate: "",
  costCentre: "",
  items: [emptyItem()],
});

interface ItemOption {
  id: number;
  code: string;
  name: string;
  description: string | null;
  standardCost: string | null;
  category: { name: string };
}

export function RequestForm({ initial, requestId }: { initial: RequestFormValues; requestId?: number }) {
  const router = useRouter();
  const [values, setValues] = useState<RequestFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const itemOptions = useApi<ItemOption[]>("/items/options");

  const set = <K extends keyof RequestFormValues>(k: K, v: RequestFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));
  const setItem = (i: number, patch: Partial<RequestFormValues["items"][number]>) =>
    setValues((s) => ({ ...s, items: s.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));

  const total = values.items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.estimatedUnitPrice) || 0), 0);

  async function save(submit: boolean, e?: FormEvent) {
    e?.preventDefault();
    setSaving(submit ? "submit" : "draft");
    setErrors({});
    setFormError(null);
    const body = {
      ...values,
      justification: values.justification || null,
      requiredDate: values.requiredDate || null,
      costCentre: values.costCentre || null,
      submit,
    };
    try {
      const r = requestId
        ? await api<{ id: number }>(`/hardware-requests/${requestId}`, { method: "PUT", body })
        : await api<{ id: number }>("/hardware-requests", { method: "POST", body });
      void router.push(`/requests/${r.data.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError("Could not save the request");
      setSaving(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const options = (itemOptions.data ?? []).map((o) => ({ value: o.id, label: `${o.name} (${o.code}) · ${o.category.name}` }));

  // Picking an item fills in its default specification and price when those are still empty.
  function chooseItem(i: number, itemId: string) {
    const option = itemOptions.data?.find((o) => String(o.id) === itemId);
    const current = values.items[i];
    setItem(i, {
      itemId,
      requestedSpecification: current.requestedSpecification || option?.description || "",
      estimatedUnitPrice: current.estimatedUnitPrice || option?.standardCost || "",
    });
  }

  return (
    <form onSubmit={(e) => save(true, e)} className="flex flex-col gap-6" noValidate>
      {formError && <Alert>{formError}</Alert>}

      <Card title="Request details">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Select
            label="Request type"
            required
            value={values.requestType}
            onChange={(e) => set("requestType", e.target.value)}
            options={appConfig.requestTypes.map((t) => ({ value: t, label: t }))}
            error={errors.requestType}
          />
          <Select
            label="Priority"
            required
            value={values.priority}
            onChange={(e) => set("priority", e.target.value)}
            options={appConfig.priorities.map((t) => ({ value: t, label: t }))}
            error={errors.priority}
          />
          <Input
            label="Purpose"
            required
            wrapperClassName="md:col-span-2"
            value={values.purpose}
            onChange={(e) => set("purpose", e.target.value)}
            placeholder="e.g. Laptop for new UX designer joining 15 Nov"
            error={errors.purpose}
            maxLength={500}
          />
          <Textarea
            label="Business justification"
            wrapperClassName="md:col-span-2"
            value={values.justification}
            onChange={(e) => set("justification", e.target.value)}
            helper="Helps approvers decide quickly."
            error={errors.justification}
            rows={3}
          />
          <Input
            label="Needed by"
            type="date"
            value={values.requiredDate}
            onChange={(e) => set("requiredDate", e.target.value)}
            error={errors.requiredDate}
          />
          <Input
            label="Cost centre"
            value={values.costCentre}
            onChange={(e) => set("costCentre", e.target.value)}
            placeholder="Optional"
            error={errors.costCentre}
          />
        </div>
      </Card>

      <Card
        title="Items"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => set("items", [...values.items, emptyItem()])}
            disabled={values.items.length >= 20}
          >
            <Plus size={16} aria-hidden="true" /> Add item
          </Button>
        }
      >
        {errors.items && <p className="mb-4 text-caption text-error">{errors.items}</p>}
        <div className="flex flex-col gap-5">
          {values.items.map((item, i) => (
            <fieldset key={i} className="rounded-md border border-neutral-200 p-4">
              <legend className="overline px-1">Item {i + 1}</legend>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <Select
                  label="Item"
                  required
                  wrapperClassName="md:col-span-5"
                  value={item.itemId}
                  onChange={(e) => chooseItem(i, e.target.value)}
                  placeholder={
                    itemOptions.loading ? "Loading…" : options.length ? "Choose an item" : "No items in the item master yet"
                  }
                  options={options}
                  error={errors[`items.${i}.itemId`]}
                />
                <Input
                  label="Quantity"
                  required
                  type="number"
                  min={1}
                  max={500}
                  wrapperClassName="md:col-span-3"
                  value={item.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                  error={errors[`items.${i}.quantity`]}
                />
                <Input
                  label="Est. unit price"
                  type="number"
                  min={0}
                  step="0.01"
                  wrapperClassName="md:col-span-3"
                  value={item.estimatedUnitPrice}
                  onChange={(e) => setItem(i, { estimatedUnitPrice: e.target.value })}
                  error={errors[`items.${i}.estimatedUnitPrice`]}
                  placeholder="Optional"
                />
                <div className="flex items-end md:col-span-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full md:w-auto md:px-3"
                    onClick={() => set("items", values.items.filter((_, idx) => idx !== i))}
                    disabled={values.items.length === 1}
                    aria-label={`Remove item ${i + 1}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span className="md:sr-only">Remove</span>
                  </Button>
                </div>
                <Textarea
                  label="Specification"
                  required
                  wrapperClassName="md:col-span-12"
                  value={item.requestedSpecification}
                  onChange={(e) => setItem(i, { requestedSpecification: e.target.value })}
                  placeholder="e.g. 16GB RAM, 512GB SSD, 14-inch, Windows 11"
                  error={errors[`items.${i}.requestedSpecification`]}
                  rows={2}
                />
              </div>
            </fieldset>
          ))}
        </div>
        {total > 0 && (
          <p className="mt-5 text-right text-body-sm text-neutral-600">
            Estimated total: <span className="font-bold text-neutral-900">{formatMoney(total)}</span>
          </p>
        )}
      </Card>

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-neutral-200 bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-lg sm:border sm:px-6">
        <Button variant="ghost" onClick={() => router.back()} disabled={!!saving}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => save(false)} loading={saving === "draft"} disabled={!!saving}>
          Save draft
        </Button>
        <Button type="submit" loading={saving === "submit"} disabled={!!saving}>
          Submit for approval
        </Button>
      </div>
    </form>
  );
}
