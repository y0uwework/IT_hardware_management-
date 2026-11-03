import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Alert } from "@/components/common/States";
import { api, ApiClientError } from "@/shared/client";
import { downloadText } from "@/shared/download";
import { appConfig } from "@/shared/config/app.config";
import { ITEM_SHEET_COLUMNS, REQUIRED_ITEM_SHEET_COLUMNS, itemSampleCsv, sheetRowsFromCsv, type ItemSheetRow } from "@/modules/items/items.sheet";
import { parseCsv, toCsv } from "@/shared/csv";
import type { CategoryOption } from "../../items.types";

interface BulkResult {
  created: number;
  exists: number;
  failed: number;
  results: { row: number; code: string; name: string; status: "created" | "exists" | "error"; messages: string[] }[];
}

export function downloadItemSample(categories: CategoryOption[]) {
  downloadText("item-master-sample.csv", itemSampleCsv(categories.filter((c) => c.isActive).map((c) => c.code)));
}

const STATUS_LABEL = { created: "Created", exists: "Already exists", error: "Error" } as const;

export function BulkUploadModal({
  open,
  categories,
  onClose,
  onUploaded,
}: {
  open: boolean;
  categories: CategoryOption[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ItemSheetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setRows(null);
    setError(null);
    setResult(null);
  }, [open]);

  async function onFile(file: File | undefined) {
    setRows(null);
    setResult(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setError("Please choose a .csv file. In Excel use File → Save As → CSV UTF-8 (Comma delimited).");
      return;
    }
    try {
      const parsed = sheetRowsFromCsv(parseCsv(await file.text()));
      if (parsed.length === 0) throw new Error("The sheet has a header row but no items");
      if (parsed.length > appConfig.itemBulkUploadMaxRows) {
        throw new Error(`The sheet has ${parsed.length} rows; upload at most ${appConfig.itemBulkUploadMaxRows} at a time`);
      }
      setRows(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file");
    }
  }

  async function upload() {
    if (!rows) return;
    setUploading(true);
    setError(null);
    try {
      const r = await api<BulkResult>("/items/bulk", { method: "POST", body: { rows } });
      setResult(r.data);
      if (r.data.created) onUploaded();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function downloadReport() {
    if (!result || !rows) return;
    const header = ["row", "status", "messages", ...ITEM_SHEET_COLUMNS];
    const lines = result.results.map((r) => {
      const src = rows[r.row - 2] ?? {};
      return [String(r.row), STATUS_LABEL[r.status], r.messages.join("; "), ...ITEM_SHEET_COLUMNS.map((c) => src[c] ?? "")];
    });
    downloadText("item-upload-result.csv", "﻿" + toCsv([header, ...lines]));
  }

  const problems = result?.results.filter((r) => r.status !== "created") ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Bulk upload items"
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={downloadReport}>
              <Download size={16} aria-hidden="true" /> Download result
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={upload} loading={uploading} disabled={!rows}>
              <Upload size={16} aria-hidden="true" /> Upload {rows ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : ""}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {!result && (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-body-sm text-neutral-700">
              <li>
                Download the{" "}
                <button type="button" className="font-semibold text-primary underline" onClick={() => downloadItemSample(categories)}>
                  sample sheet
                </button>{" "}
                and fill one item per row (replace the example rows).
              </li>
              <li>Save it as CSV and choose it below. Existing item codes or names are skipped, not overwritten.</li>
            </ol>
            <div className="rounded-md bg-neutral-50 p-3 text-caption text-neutral-600">
              <p>
                <span className="font-semibold">Required:</span> {REQUIRED_ITEM_SHEET_COLUMNS.join(", ")}
              </p>
              <p>
                <span className="font-semibold">category_code:</span>{" "}
                {categories.filter((c) => c.isActive).map((c) => c.code).join(", ") || "—"}
              </p>
              <p>
                <span className="font-semibold">item_type:</span> {appConfig.itemTypes.join(", ")}
              </p>
              <p>
                <span className="font-semibold">unit_of_measure:</span> {appConfig.unitsOfMeasure.join(", ")} (default Nos)
              </p>
              <p>
                <span className="font-semibold">is_active:</span> Yes / No (default Yes)
              </p>
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <Upload size={16} aria-hidden="true" /> Choose CSV file
              </Button>
              {fileName && (
                <span className="ml-3 text-body-sm text-neutral-600">
                  {fileName}
                  {rows && ` · ${rows.length} row${rows.length === 1 ? "" : "s"} ready`}
                </span>
              )}
            </div>
          </>
        )}

        {error && <Alert>{error}</Alert>}

        {result && (
          <>
            <Alert tone={result.failed ? "warning" : "success"}>
              {result.created} created · {result.exists} already existed · {result.failed} with errors
            </Alert>
            {problems.length > 0 && (
              <div className="max-h-80 overflow-auto rounded-md border border-neutral-200">
                <table className="w-full text-left text-body-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-neutral-200 text-overline uppercase text-neutral-500">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((p) => (
                      <tr key={p.row} className="border-b border-neutral-200 align-top last:border-0">
                        <td className="px-3 py-2 font-mono">{p.row}</td>
                        <td className="px-3 py-2">
                          <span className="block font-mono">{p.code || "—"}</span>
                          <span className="block text-neutral-500">{p.name}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`block font-semibold ${p.status === "error" ? "text-error" : "text-neutral-700"}`}>
                            {STATUS_LABEL[p.status]}
                          </span>
                          {p.messages.map((m) => (
                            <span key={m} className="block text-neutral-600">
                              {m}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
