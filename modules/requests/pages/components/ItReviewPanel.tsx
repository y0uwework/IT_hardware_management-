import { useEffect, useState } from "react";
import { Button } from "@/components/common/Button";
import { Input, Textarea } from "@/components/common/FormField";
import { Card } from "@/components/common/Card";
import { toastSetter } from "@/components/common/Toast";
import { api, ApiClientError } from "@/shared/client";
import { requestItemLabel, type RequestDetail, type RequestItem } from "../../requests.types";

interface Availability {
  quantityAvailable: number;
  warehouse: { id: number; name: string; code: string };
}

interface LineState {
  approvedSpecification: string;
  comments: string;
  procureQuantity: string;
  reserve: Record<number, string>; // warehouseId -> qty
}

function remaining(item: RequestItem) {
  const reserved = item.reservations.filter((r) => r.status === "Active").reduce((s, r) => s + r.quantity, 0);
  return Math.max(0, item.quantity - item.fulfilledQuantity - reserved - item.procurementQuantity);
}

/**
 * IT technical review: confirm spec, reserve from stock per warehouse, send any
 * shortfall to procurement. Can be repeated as stock arrives.
 */
export function ItReviewPanel({ request, onSaved }: { request: RequestDetail; onSaved: () => void }) {
  const openItems = request.items.filter((i) => remaining(i) > 0 || i.procurementQuantity > 0);
  const [availability, setAvailability] = useState<Record<number, Availability[]>>({});
  const [lines, setLines] = useState<Record<number, LineState>>(() =>
    Object.fromEntries(
      request.items.map((i) => [
        i.id,
        {
          approvedSpecification: i.approvedSpecification ?? i.requestedSpecification,
          comments: i.itReviewComments ?? "",
          procureQuantity: String(i.procurementQuantity),
          reserve: {},
        },
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const setError = toastSetter("error");

  useEffect(() => {
    const categoryIds = Array.from(new Set(request.items.map((i) => i.category.id)));
    let cancelled = false;
    Promise.all(
      categoryIds.map((cid) =>
        api<Availability[]>(`/inventory/availability?categoryId=${cid}`)
          .then((r) => [cid, r.data] as const)
          .catch(() => [cid, [] as Availability[]] as const)
      )
    ).then((pairs) => {
      if (!cancelled) setAvailability(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [request.items]);

  const setLine = (id: number, patch: Partial<LineState>) => setLines((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/hardware-requests/${request.id}/it-review`, {
        method: "POST",
        body: {
          items: request.items.map((i) => {
            const l = lines[i.id];
            return {
              itemId: i.id,
              approvedSpecification: l.approvedSpecification || null,
              comments: l.comments || null,
              procureQuantity: Number(l.procureQuantity) || 0,
              reserve: Object.entries(l.reserve)
                .map(([wid, q]) => ({ warehouseId: Number(wid), quantity: Number(q) || 0 }))
                .filter((r) => r.quantity > 0),
            };
          }),
        },
      });
      setLines((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, reserve: {} }])));
      onSaved();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not save the review");
    } finally {
      setSaving(false);
    }
  }

  if (openItems.length === 0) return null;

  return (
    <Card
      title="IT review & stock check"
      actions={
        <Button onClick={save} loading={saving} size="sm">
          Save review
        </Button>
      }
    >
      <p className="mb-5 text-body-sm text-neutral-600">
        Reserve available stock per warehouse and mark any shortfall for procurement. Partial fulfilment is supported, so
        you can come back when more stock arrives.
      </p>
      <div className="flex flex-col gap-6">
        {request.items.map((item) => {
          const l = lines[item.id];
          const left = remaining(item);
          const avail = availability[item.category.id];
          return (
            <div key={item.id} className="rounded-md border border-neutral-200 p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-headline text-base font-semibold">
                  {item.quantity} × {requestItemLabel(item)}
                  {item.item && <span className="ml-2 text-caption font-normal text-neutral-500">{item.category.name}</span>}
                </h3>
                <span className="text-caption text-neutral-500">
                  {left} unplanned · {item.procurementQuantity} to procure · {item.fulfilledQuantity} delivered
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Textarea
                  label="Approved specification"
                  rows={2}
                  value={l.approvedSpecification}
                  onChange={(e) => setLine(item.id, { approvedSpecification: e.target.value })}
                />
                <Textarea
                  label="Technical notes"
                  rows={2}
                  value={l.comments}
                  onChange={(e) => setLine(item.id, { comments: e.target.value })}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-neutral-900">Reserve from stock</p>
                  {!avail && <p className="text-body-sm text-neutral-500">Checking stock…</p>}
                  {avail && avail.length === 0 && (
                    <p className="text-body-sm text-neutral-500">No matching stock available.</p>
                  )}
                  {avail && avail.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {avail.map((a) => (
                        <li key={a.warehouse.id} className="flex items-center gap-3">
                          <span className="flex-1 text-body-sm">
                            {a.warehouse.name}{" "}
                            <span className="text-neutral-500">({a.quantityAvailable} available)</span>
                          </span>
                          <Input
                            aria-label={`Reserve quantity from ${a.warehouse.name}`}
                            type="number"
                            min={0}
                            max={Math.min(a.quantityAvailable, left)}
                            value={l.reserve[a.warehouse.id] ?? ""}
                            placeholder="0"
                            onChange={(e) => setLine(item.id, { reserve: { ...l.reserve, [a.warehouse.id]: e.target.value } })}
                            wrapperClassName="w-24"
                            disabled={left === 0}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Input
                  label="Total quantity to procure"
                  type="number"
                  min={item.procurementQuantity}
                  max={item.procurementQuantity + left}
                  value={l.procureQuantity}
                  onChange={(e) => setLine(item.id, { procureQuantity: e.target.value })}
                  helper="Units that must be purchased because stock is short."
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
