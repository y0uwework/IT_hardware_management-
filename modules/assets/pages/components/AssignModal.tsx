import { useEffect, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { Input, Select, Textarea } from "@/components/common/FormField";
import { toastSetter } from "@/components/common/Toast";
import { api, ApiClientError, qs } from "@/shared/client";
import { appConfig } from "@/shared/config/app.config";

interface UserOption {
  id: number;
  fullName: string;
  employeeCode: string;
  department: string | null;
}

/**
 * Issue an asset. When `fixedUser` is given (fulfilling a request) the employee
 * cannot be changed; otherwise the issuer searches the existing users table.
 */
export function AssignModal({
  open,
  onClose,
  onDone,
  asset,
  fixedUser,
  requestItemId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  asset: { id: number; assetTag: string };
  fixedUser?: { id: number; fullName: string };
  requestItemId?: number;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState<string>(fixedUser ? String(fixedUser.id) : "");
  const [condition, setCondition] = useState<string>("Good");
  const [accessories, setAccessories] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const setError = toastSetter("error");

  useEffect(() => {
    if (!open || fixedUser) return;
    const t = setTimeout(() => {
      api<UserOption[]>(`/users${qs({ search, activeOnly: "true", limit: 20 })}`)
        .then((r) => setOptions(r.data))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, open, fixedUser]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api(`/assets/${asset.id}/assign`, {
        method: "POST",
        body: {
          userId: Number(userId),
          requestItemId: requestItemId ?? null,
          condition,
          accessories: accessories || null,
          notes: notes || null,
        },
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not assign the asset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Issue ${asset.assetTag}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={!userId}>
            Issue asset
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {fixedUser ? (
          <div>
            <p className="text-[13px] font-semibold">Employee</p>
            <p className="text-body">{fixedUser.fullName}</p>
          </div>
        ) : (
          <>
            <Input label="Find employee" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or employee code" />
            <Select
              label="Employee"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Choose an employee"
              options={options.map((u) => ({
                value: u.id,
                label: `${u.fullName} (${u.employeeCode})${u.department ? ` · ${u.department}` : ""}`,
              }))}
            />
          </>
        )}
        <Select
          label="Condition at handover"
          required
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          options={appConfig.assetConditions.map((c) => ({ value: c, label: c }))}
        />
        <Input label="Accessories" value={accessories} onChange={(e) => setAccessories(e.target.value)} placeholder="e.g. Charger, bag, mouse" />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        <p className="text-caption font-normal text-neutral-500">The employee will be asked to acknowledge receipt.</p>
      </div>
    </Modal>
  );
}
