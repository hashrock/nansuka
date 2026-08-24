import { describe, expect, it } from "vitest";
import { parseRows, rowsFromLegacyInput, serializeRows } from "./rowsCodec";
import { createRow } from "./types";

describe("parseRows", () => {
  it("round-trips serialized rows", () => {
    const rows = [createRow("hello", "こんにちは"), createRow("bye")];
    expect(parseRows(serializeRows(rows))).toEqual(rows);
  });

  it("always yields at least one row", () => {
    expect(parseRows("[]")).toHaveLength(1);
    expect(parseRows("")).toHaveLength(1);
    expect(parseRows("not json")).toHaveLength(1);
    expect(parseRows("null")).toHaveLength(1);
  });

  it("fills in missing fields rather than dropping the row", () => {
    const rows = parseRows(JSON.stringify([{ id: "a", source: "hi" }]));
    expect(rows[0]).toMatchObject({
      id: "a",
      source: "hi",
      translated: "",
      overridden: false,
    });
  });

  it("gives an id to a row that lacks one", () => {
    const rows = parseRows(JSON.stringify([{ source: "hi" }]));
    expect(rows[0].id).toBeTruthy();
  });

  it("skips entries that are not objects", () => {
    const rows = parseRows(JSON.stringify(["nope", 42, { source: "kept" }]));
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("kept");
  });
});

describe("rowsFromLegacyInput", () => {
  it("splits the old blank-line separated text", () => {
    const rows = rowsFromLegacyInput("one\n\ntwo\n\nthree");
    expect(rows.map((r) => r.source)).toEqual(["one", "two", "three"]);
  });

  it("yields one empty row for blank input", () => {
    expect(rowsFromLegacyInput("   ")).toHaveLength(1);
  });
});
