import { useEffect, useState } from "react";
import { Button } from "@/components/common/Button";
import { Checkbox, Input, Select, Textarea } from "@/components/common/FormField";
import { Modal } from "@/components/common/Modal";
import { Alert } from "@/components/common/States";
import { api, ApiClientError, qs } from "@/lib/client";
import { appConfig } from "@/config/app.config";
import type { CategoryOption, ItemRow } from "./types";

interface FormValues {
  code: string;
  name: string;
  categoryId: string;
  itemType: string;
  manufacturer: string;
  model: string;
  partNumber: string;
  description: string;
  unitOfMeasure: string;
  hsnCode: string;
  standardCost: string;
  warrantyMonths: string;
  reorderLevel: string;
  isActive: boolean;
}

const blank = (): FormValues => ({
  code: "",
  name: "",
  categoryId: "",
  itemType: appConfig.itemTypes[0],
  manufacturer: "",
  model: "",
  partNumber: "",
  description: "",
  unitOfMeasure: appConfig.unitsOfMeasure[0],
  hsnCode: "",
  standardCost: "",
  warrantyMonths: "",
  reorderLevel: "",
  isActive: true,
});

const fromItem = (i: ItemRow): FormValues => ({
  code: i.code,
  name: i.name,
  categoryId: String(i.categoryId),
  itemType: i.itemType,
  manufacturer: i.manufacturer ?? "",
  model: i.model ?? "",
  partNumber: i.partNumber ?? "",
  description: i.description ?? "",
  unitOfMeasure: i.unitOfMeasure,
  hsnCode: i.hsnCode ?? "",
  standardCost: i.standardCost ?? "",
  warrantyMonths: i.warrantyMonths?.toString() ?? "",
  reorderLevel: i.reorderLevel?.toString() ?? "",
  isActive: i.isActive,
});

interface DuplicateCheck {
  codeExists: boolean;
  nameExists: boolean;
  existing: { itemCode: string; itemName: string } | null;
}

/** Add / edit an item. `item === null` means a new item. */
export function ItemFormModal({
  open,
  item,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: ItemRow | null;
  categories: CategoryOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<FormValues>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<DuplicateCheck | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(item ? fromItem(item) : blank());
    setError(null);
    setFieldErrors({});
    setDup(null);
  }, [open, item]);

  // Live "already exists" check while typing the code or name (saving checks again on the server).
  useEffect(() => {
    if (!open) return;
    const code = values.code.trim();
    const name = values.name.trim();
    if (code.length < 2 && name.length < 2) {
      setDup(null);
      return;
    }
    const t = setTimeout(() => {
      api<DuplicateCheck>(
        `/items/check${qs({ code: code.length >= 2 ? code : undefined, name: name.length >= 2 ? name : undefined, excludeId: item?.id })}`
      )
        .then((r) => setDup(r.data))
        .catch(() => setDup(null));
    }, 400);
    return () => clearTimeout(t);
  }, [open, values.code, values.name, item?.id]);

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(item ? `/items/${item.id}` : "/items", { method: item ? "PUT" : "POST", body: values });
      onSaved();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        setFieldErrors(e.fieldErrors);
      } else setError("Could not save the item");
    } finally {
      setSaving(false);
    }
  }

  // Inactive categories stay selectable only for an item already in one.
  const categoryOptions = categories
    .filter((c) => c.isActive || String(c.id) === values.categoryId)
    .map((c) => ({ value: c.id, label: `${c.name} (${c.code})${c.isActive ? "" : " — inactive"}` }));
  // The list may only hold active categories; keep the item's current one selectable.
  if (item && !categoryOptions.some((o) => o.value === item.category.id)) {
    categoryOptions.push({ value: item.category.id, label: `${item.category.name} (${item.category.code}) — inactive` });
  }

  const codeError = fieldErrors.code ?? (dup?.codeExists ? "This item code already exists" : undefined);
  const nameError = fieldErrors.name ?? (dup?.nameExists ? "An item with this name already exists" : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? `Edit item ${item.code}` : "Add item"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!!dup?.codeExists || !!dup?.nameExists}>
            {item ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Item code"
            required
            value={values.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            error={codeError}
            helper="Unique. Letters, digits, - _ / ."
            className="font-mono"
            maxLength={50}
          />
          <Input label="Item name" required value={values.name} onChange={(e) => set("name", e.target.value)} error={nameError} maxLength={200} />
          <Select
            label="Category"
            required
            value={values.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            placeholder="Choose a category"
            options={categoryOptions}
            error={fieldErrors.categoryId}
          />
          <Select
            label="Item type"
            required
            value={values.itemType}
            onChange={(e) => set("itemType", e.target.value)}
            options={appConfig.itemTypes.map((t) => ({ value: t, label: t }))}
            error={fieldErrors.itemType}
          />
          <Input label="Manufacturer" value={values.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} error={fieldErrors.manufacturer} maxLength={100} />
          <Input label="Model" value={values.model} onChange={(e) => set("model", e.target.value)} error={fieldErrors.model} maxLength={150} />
          <Input
            label="Part number / SKU"
            value={values.partNumber}
            onChange={(e) => set("partNumber", e.target.value)}
            error={fieldErrors.partNumber}
            maxLength={100}
          />
          <Select
            label="Unit of measure"
            required
            value={values.unitOfMeasure}
            onChange={(e) => set("unitOfMeasure", e.target.value)}
            options={appConfig.unitsOfMeasure.map((u) => ({ value: u, label: u }))}
            error={fieldErrors.unitOfMeasure}
          />
          <Input
            label="HSN/SAC code"
            inputMode="numeric"
            value={values.hsnCode}
            onChange={(e) => set("hsnCode", e.target.value.replace(/\D/g, ""))}
            error={fieldErrors.hsnCode}
            maxLength={8}
            placeholder="e.g. 84713010"
          />
          <Input
            label="Standard cost"
            type="number"
            min={0}
            step="0.01"
            value={values.standardCost}
            onChange={(e) => set("standardCost", e.target.value)}
            error={fieldErrors.standardCost}
            helper="Pre-fills the estimated price on requests."
          />
          <Input
            label="Warranty (months)"
            type="number"
            min={0}
            max={240}
            value={values.warrantyMonths}
            onChange={(e) => set("warrantyMonths", e.target.value)}
            error={fieldErrors.warrantyMonths}
          />
          <Input
            label="Reorder level"
            type="number"
            min={0}
            value={values.reorderLevel}
            onChange={(e) => set("reorderLevel", e.target.value)}
            error={fieldErrors.reorderLevel}
            helper="Stock level that should trigger re-ordering."
          />
          <Textarea
            label="Description / default specification"
            wrapperClassName="md:col-span-2"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            error={fieldErrors.description}
            helper="Pre-fills the specification when this item is requested."
            rows={3}
            maxLength={1000}
          />
        </div>
        {dup?.existing && (
          <Alert tone="warning">
            Already in the item master: <span className="font-mono">{dup.existing.itemCode}</span> — {dup.existing.itemName}
          </Alert>
        )}
        <Checkbox
          label="Active"
          description="Inactive items stay in the master but can't be chosen on new requests."
          checked={values.isActive}
          onChange={(on) => set("isActive", on)}
        />
      </div>
    </Modal>
  );
}
