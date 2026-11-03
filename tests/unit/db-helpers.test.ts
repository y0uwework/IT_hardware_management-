import { describe, expect, it } from "vitest";
import { Where, likeContains, nest } from "../../shared/db";
import { categoryCols, itemCols } from "../../shared/sql-columns";

describe("nest", () => {
  it("turns dotted aliases into nested objects", () => {
    expect(nest({ id: 1, "requester.id": 7, "requester.fullName": "A", "_count.items": 2 })).toEqual({
      id: 1,
      requester: { id: 7, fullName: "A" },
      _count: { items: 2 },
    });
  });

  it("collapses an unmatched LEFT JOIN to null, including nested levels", () => {
    expect(nest({ id: 1, "requestItem.request.id": null, "requestItem.request.requestNumber": null })).toEqual({
      id: 1,
      requestItem: null,
    });
  });

  it("keeps an object when any value is present, and leaves top-level nulls alone", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    expect(nest({ notes: null, "asset.id": 3, "asset.model": null, "asset.at": at })).toEqual({
      notes: null,
      asset: { id: 3, model: null, at },
    });
  });
});

describe("likeContains", () => {
  it("wraps in % and escapes LIKE wildcards", () => {
    expect(likeContains("50%_[x]")).toBe("%50[%][_][[]x]%");
  });
});

describe("Where", () => {
  it("renders nothing when empty and ANDs conditions with merged params", () => {
    expect(String(new Where())).toBe("");
    const w = new Where().add("a = @a", { a: 1 }).add("b = @b", { b: 2 });
    expect(String(w)).toBe("WHERE a = @a AND b = @b");
    expect(w.params).toEqual({ a: 1, b: 2 });
  });
});

describe("column fragments", () => {
  it("alias columns and prefix nested fields", () => {
    expect(categoryCols("c", "category.")).toContain("c.[is_serialized] AS [category.isSerialized]");
  });
  it("return decimals as strings", () => {
    expect(itemCols("i")).toContain("CONVERT(NVARCHAR(40), i.[estimated_unit_price]) AS [estimatedUnitPrice]");
  });
});
