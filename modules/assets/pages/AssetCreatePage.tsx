import { useState, type FormEvent } from "react";
import { useRouter } from "next/router";
import { MainLayout, PageHeader } from "@/components/layout/MainLayout";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { Alert } from "@/components/common/States";
import type { ProtectedPageProps } from "@/middlewares/page-auth";
import { api, ApiClientError, useApi } from "@/shared/client";
import { appConfig } from "@/shared/config/app.config";

const empty = {
  categoryId: "",
  warehouseId: "",
  serialNumber: "",
  manufacturer: "",
  model: "",
  specification: "",
  purchaseDate: "",
  purchaseCost: "",
  warrantyEndDate: "",
  condition: "New",
  notes: "",
};

export default function CreateAssetPage({ user, forbidden }: ProtectedPageProps) {
  const router = useRouter();
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const categories = useApi<{ id: number; name: string; isSerialized: boolean }[]>(forbidden ? null : "/master-data/categories");
  const warehouses = useApi<{ id: number; name: string }[]>(forbidden ? null : "/master-data/warehouses");
  const set = (k: keyof typeof empty, val: string) => setV((s) => ({ ...s, [k]: val }));

  async function submit(e: FormEvent, another = false) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    setSuccess(null);
    try {
      const r = await api<{ id: number; assetTag: string }>("/assets", { method: "POST", body: v });
      if (another) {
        setV((s) => ({ ...empty, categoryId: s.categoryId, warehouseId: s.warehouseId, manufacturer: s.manufacturer, model: s.model, purchaseDate: s.purchaseDate, purchaseCost: s.purchaseCost, warrantyEndDate: s.warrantyEndDate, specification: s.specification }));
        setSuccess(`Registered ${r.data.assetTag}. Enter the next device.`);
        setSaving(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      void router.push(`/assets/${r.data.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError("Could not register the asset");
      setSaving(false);
    }
  }

  return (
    <MainLayout user={user} title="Register asset" forbidden={forbidden}>
      <PageHeader
        title="Register asset"
        subtitle="Add an individually tracked device to stock. An asset tag is generated automatically."
        breadcrumbs={[{ label: "Asset register", href: "/assets" }, { label: "Register" }]}
      />
      <form onSubmit={(e) => submit(e)} className="flex flex-col gap-6" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}
        <Card title="Device">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Select
              label="Category"
              required
              value={v.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              placeholder="Choose a category"
              options={(categories.data ?? []).filter((c) => c.isSerialized).map((c) => ({ value: c.id, label: c.name }))}
              error={errors.categoryId}
              helper="Only serialized categories are listed. Record consumables as stock receipts in Inventory."
            />
            <Select
              label="Warehouse"
              required
              value={v.warehouseId}
              onChange={(e) => set("warehouseId", e.target.value)}
              placeholder="Choose a warehouse"
              options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
              error={errors.warehouseId}
            />
            <Input label="Manufacturer" value={v.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} error={errors.manufacturer} />
            <Input label="Model" value={v.model} onChange={(e) => set("model", e.target.value)} error={errors.model} />
            <Input label="Serial number" value={v.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} error={errors.serialNumber} className="font-mono" />
            <Select
              label="Condition"
              value={v.condition}
              onChange={(e) => set("condition", e.target.value)}
              options={appConfig.assetConditions.map((c) => ({ value: c, label: c }))}
            />
            <Textarea label="Specification" wrapperClassName="md:col-span-2" value={v.specification} onChange={(e) => set("specification", e.target.value)} rows={2} />
          </div>
        </Card>
        <Card title="Purchase & warranty">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Input label="Purchase date" type="date" value={v.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} error={errors.purchaseDate} />
            <Input label="Purchase cost" type="number" min={0} step="0.01" value={v.purchaseCost} onChange={(e) => set("purchaseCost", e.target.value)} error={errors.purchaseCost} />
            <Input label="Warranty ends" type="date" value={v.warrantyEndDate} onChange={(e) => set("warrantyEndDate", e.target.value)} error={errors.warrantyEndDate} />
            <Textarea label="Notes" wrapperClassName="md:col-span-3" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={(e) => submit(e as unknown as FormEvent, true)} disabled={saving}>
            Save &amp; add another
          </Button>
          <Button type="submit" loading={saving}>
            Register asset
          </Button>
        </div>
      </form>
    </MainLayout>
  );
}
