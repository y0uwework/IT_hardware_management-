// Item master bulk-upload sheet: column layout plus a small CSV reader/writer.
// Shared by the browser (sample download, parsing the chosen file) and the server (row mapping).
// CSV is used so no spreadsheet library is needed; Excel opens and saves it directly.

export const ITEM_SHEET_COLUMNS = [
  "item_code",
  "item_name",
  "category_code",
  "item_type",
  "manufacturer",
  "model",
  "part_number",
  "unit_of_measure",
  "hsn_code",
  "standard_cost",
  "warranty_months",
  "reorder_level",
  "description",
  "is_active",
] as const;

export type ItemSheetColumn = (typeof ITEM_SHEET_COLUMNS)[number];
export type ItemSheetRow = Partial<Record<ItemSheetColumn, string>>;

export const REQUIRED_ITEM_SHEET_COLUMNS: ItemSheetColumn[] = ["item_code", "item_name", "category_code", "item_type"];

/**
 * Parse CSV text (RFC 4180: quoted fields, "" escapes, commas/newlines inside quotes, CRLF or LF,
 * optional UTF-8 BOM). Returns rows of cells; fully blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Turn parsed CSV cells into sheet rows keyed by column name. Header names are matched
 * case-insensitively, ignoring spaces. Throws a readable Error if required columns are missing.
 */
export function sheetRowsFromCsv(cells: string[][]): ItemSheetRow[] {
  if (cells.length === 0) throw new Error("The file is empty");
  const normalize = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const header = cells[0].map(normalize);
  const missing = REQUIRED_ITEM_SHEET_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}. Download the sample sheet for the expected layout.`);

  const index = new Map<ItemSheetColumn, number>();
  for (const col of ITEM_SHEET_COLUMNS) {
    const i = header.indexOf(col);
    if (i >= 0) index.set(col, i);
  }
  return cells.slice(1).map((r) => {
    const out: ItemSheetRow = {};
    for (const [col, i] of index) out[col] = (r[i] ?? "").trim();
    return out;
  });
}

/** Sample sheet: header row plus example rows (with a UTF-8 BOM so Excel reads it correctly). */
export function itemSampleCsv(categoryCodes: string[]): string {
  const cat = (i: number) => categoryCodes[i] ?? categoryCodes[0] ?? "LAPTOP";
  return (
    "﻿" +
    toCsv([
      [...ITEM_SHEET_COLUMNS],
      ["LAP-DL5440", "Dell Latitude 5440 14in", cat(0), "Hardware", "Dell", "Latitude 5440", "N010L544014IN", "Nos", "84713010", "72000", "36", "5", "Intel i5, 16GB RAM, 512GB SSD, 14-inch FHD, Windows 11 Pro", "Yes"],
      ["ACC-MK270", "Logitech MK270 Wireless Combo", cat(1), "Accessory", "Logitech", "MK270", "920-004536", "Set", "84716060", "1800", "12", "20", "Wireless keyboard and mouse combo", "Yes"],
    ])
  );
}
