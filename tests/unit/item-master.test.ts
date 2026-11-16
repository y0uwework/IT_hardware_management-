import { describe, expect, it } from "vitest";
import { ITEM_SHEET_COLUMNS, itemSampleCsv, sheetRowsFromCsv } from "../../modules/items/items.sheet";
import { parseCsv, toCsv } from "../../shared/csv";
import { itemInputSchema } from "../../modules/items/items.validation";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,,3\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\nline2"],
      ["1", "", "3"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [["a,b", 'q"q', " pad "], ["", "x", "y"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("sheetRowsFromCsv", () => {
  it("maps headers case-insensitively and ignores unknown columns", () => {
    const rows = sheetRowsFromCsv([
      ["Item Code", "ITEM_NAME", "category-code", "item_type", "extra"],
      [" lap-1 ", "Laptop", "LAPTOP", "Hardware", "ignored"],
    ]);
    expect(rows).toEqual([{ item_code: "lap-1", item_name: "Laptop", category_code: "LAPTOP", item_type: "Hardware" }]);
  });

  it("carries the software licence columns", () => {
    const rows = sheetRowsFromCsv([
      ["item_code", "item_name", "category_code", "item_type", "software_version", "licence_type", "licence_seats"],
      ["sw-m365-e3", "Microsoft 365 E3", "SOFTWARE", "Software", "E3", "Subscription", "25"],
    ]);
    expect(rows[0]).toMatchObject({ software_version: "E3", licence_type: "Subscription", licence_seats: "25" });
  });

  it("rejects a sheet missing required columns", () => {
    expect(() => sheetRowsFromCsv([["item_code", "item_name"]])).toThrow(/category_code, item_type/);
  });

  it("parses the sample sheet it generates", () => {
    const rows = sheetRowsFromCsv(parseCsv(itemSampleCsv(["LAPTOP", "KEYBOARD", "SOFTWARE"])));
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0])).toEqual([...ITEM_SHEET_COLUMNS]);
    expect(rows[1].category_code).toBe("KEYBOARD");
    expect(rows[2]).toMatchObject({ item_type: "Software", licence_type: "Subscription", licence_seats: "25" });
  });
});

describe("itemInputSchema", () => {
  const base = { code: "lap-dl5440", name: "Dell Latitude", categoryId: "3", itemType: "Hardware" };

  it("uppercases the code, defaults unit/active and turns blanks into null", () => {
    const r = itemInputSchema.parse({ ...base, manufacturer: " ", standardCost: "", warrantyMonths: "" });
    expect(r).toMatchObject({
      code: "LAP-DL5440",
      categoryId: 3,
      unitOfMeasure: "Nos",
      isActive: true,
      manufacturer: null,
      standardCost: null,
      warrantyMonths: null,
    });
  });

  it("accepts Yes/No for is_active and numeric strings", () => {
    const r = itemInputSchema.parse({ ...base, isActive: "No", standardCost: "1250.50", reorderLevel: "5" });
    expect(r).toMatchObject({ isActive: false, standardCost: 1250.5, reorderLevel: 5 });
  });

  it("keeps licence details on software and drops them from other item types", () => {
    const sw = itemInputSchema.parse({
      ...base,
      itemType: "Software",
      softwareVersion: " 2024 ",
      licenceType: "Subscription",
      licenceSeats: "10",
    });
    expect(sw).toMatchObject({ softwareVersion: "2024", licenceType: "Subscription", licenceSeats: 10 });

    const hw = itemInputSchema.parse({ ...base, softwareVersion: "2024", licenceType: "Subscription", licenceSeats: "10" });
    expect(hw).toMatchObject({ softwareVersion: null, licenceType: null, licenceSeats: null });
  });

  it("rejects bad item types, HSN codes and negative numbers", () => {
    const r = itemInputSchema.safeParse({ ...base, itemType: "Gadget", hsnCode: "12", standardCost: "-1" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["itemType", "hsnCode", "standardCost"]));
  });
});
