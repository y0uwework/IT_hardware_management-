// Browser-side file download helpers.
import { toCsv } from "./item-sheet";

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV with a UTF-8 BOM so Excel shows non-ASCII text (₹, names) correctly. */
export function downloadCsv(filename: string, rows: string[][]) {
  downloadText(filename, "﻿" + toCsv(rows));
}
