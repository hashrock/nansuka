import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  applyTranslations,
  clearCells,
  deleteRows,
  extractGrid,
  insertRows,
  moveRows,
  pasteGrid,
  setCell,
} from "./operations";
import { COL_SOURCE, COL_TRANSLATED, type Row } from "./types";

function rows(...specs: [string, string?, boolean?][]): Row[] {
  return specs.map(([source, translated = "", overridden = false], i) => ({
    id: `r${i}`,
    source,
    translated,
    overridden,
  }));
}

describe("setCell", () => {
  it("clears the translation when the source changes", () => {
    const next = setCell(rows(["hello", "こんにちは", true]), 0, COL_SOURCE, "bye");
    expect(next[0]).toMatchObject({
      source: "bye",
      translated: "",
      overridden: false,
    });
  });

  it("marks the row as overridden when the translation is edited", () => {
    const next = setCell(rows(["hello", "こんにちは"]), 0, COL_TRANSLATED, "やあ");
    expect(next[0]).toMatchObject({ translated: "やあ", overridden: true });
  });

  it("does not mark an emptied translation as overridden", () => {
    const next = setCell(rows(["hello", "こんにちは", true]), 0, COL_TRANSLATED, "");
    expect(next[0]).toMatchObject({ translated: "", overridden: false });
  });

  it("returns the same array when nothing changes", () => {
    const before = rows(["hello"]);
    expect(setCell(before, 0, COL_SOURCE, "hello")).toBe(before);
  });
});

describe("clearCells", () => {
  it("empties every cell in the rectangle", () => {
    const next = clearCells(rows(["a", "A"], ["b", "B"], ["c", "C"]), {
      top: 0,
      bottom: 1,
      left: 0,
      right: 1,
    });
    expect(next.map((r) => [r.source, r.translated])).toEqual([
      ["", ""],
      ["", ""],
      ["c", "C"],
    ]);
  });
});

describe("insertRows / deleteRows", () => {
  it("inserts blank rows at the given index", () => {
    const next = insertRows(rows(["a"], ["b"]), 1, 2);
    expect(next.map((r) => r.source)).toEqual(["a", "", "", "b"]);
  });

  it("deletes an inclusive range", () => {
    const next = deleteRows(rows(["a"], ["b"], ["c"]), 0, 1);
    expect(next.map((r) => r.source)).toEqual(["c"]);
  });

  it("always keeps at least one row", () => {
    const next = deleteRows(rows(["a"], ["b"]), 0, 1);
    expect(next).toHaveLength(1);
    expect(next[0].source).toBe("");
  });
});

describe("moveRows", () => {
  it("moves a row downward accounting for the removal shift", () => {
    const next = moveRows(rows(["a"], ["b"], ["c"], ["d"]), 0, 1, 3);
    expect(next.map((r) => r.source)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a row upward", () => {
    const next = moveRows(rows(["a"], ["b"], ["c"]), 2, 1, 0);
    expect(next.map((r) => r.source)).toEqual(["c", "a", "b"]);
  });

  it("moves a contiguous block", () => {
    const next = moveRows(rows(["a"], ["b"], ["c"], ["d"]), 0, 2, 4);
    expect(next.map((r) => r.source)).toEqual(["c", "d", "a", "b"]);
  });

  it("is a no-op when dropped inside itself", () => {
    const before = rows(["a"], ["b"], ["c"]);
    expect(moveRows(before, 0, 2, 1)).toBe(before);
  });
});

describe("pasteGrid", () => {
  it("appends rows when the paste overflows the grid", () => {
    const next = pasteGrid(rows(["a"]), 0, COL_SOURCE, [["x"], ["y"], ["z"]]);
    expect(next.map((r) => r.source)).toEqual(["x", "y", "z"]);
  });

  it("fills both columns and marks pasted translations as overridden", () => {
    const next = pasteGrid(rows(["a"]), 0, COL_SOURCE, [["hello", "こんにちは"]]);
    expect(next[0]).toMatchObject({
      source: "hello",
      translated: "こんにちは",
      overridden: true,
    });
  });

  it("ignores columns past the translation column", () => {
    const next = pasteGrid(rows(["a"]), 0, COL_TRANSLATED, [["one", "two"]]);
    expect(next[0]).toMatchObject({ source: "a", translated: "one" });
  });
});

describe("extractGrid", () => {
  it("reads the rectangle as strings", () => {
    expect(
      extractGrid(rows(["a", "A"], ["b", "B"]), {
        top: 0,
        bottom: 1,
        left: 0,
        right: 1,
      }),
    ).toEqual([
      ["a", "A"],
      ["b", "B"],
    ]);
  });
});

describe("applyTranslations", () => {
  it("fills in the translation for a matching row", () => {
    const next = applyTranslations(rows(["hello"]), [
      { id: "r0", source: "hello", translated: "こんにちは" },
    ]);
    expect(next[0].translated).toBe("こんにちは");
  });

  it("drops a result whose source changed while in flight", () => {
    const before = rows(["bye"]);
    expect(
      applyTranslations(before, [
        { id: "r0", source: "hello", translated: "こんにちは" },
      ]),
    ).toBe(before);
  });

  it("never overwrites a hand-edited translation", () => {
    const before = rows(["hello", "やあ", true]);
    expect(
      applyTranslations(before, [
        { id: "r0", source: "hello", translated: "こんにちは" },
      ]),
    ).toBe(before);
  });
});

/**
 * 行の並べ替えと増減は、どんな範囲を渡されても行そのものを失わない
 * ことが前提になっている (Undo が壊れる)。境界の組み合わせは手で列挙
 * しきれないので fast-check に任せる。
 */
const anyRows = fc
  .array(
    fc.tuple(
      fc.string({ maxLength: 4 }),
      fc.string({ maxLength: 4 }),
      fc.boolean(),
    ),
    { minLength: 1, maxLength: 6 },
  )
  .map((specs) => rows(...specs));
const index = fc.nat({ max: 8 });

function ids(list: Row[]): string[] {
  return list.map((row) => row.id).sort();
}

describe("operations properties", () => {
  propIt.prop([anyRows, index, fc.nat({ max: 4 }), index])(
    "moveRows keeps every row, whatever range it is given",
    (before, from, count, to) => {
      const after = moveRows(before, from, count, to);
      expect(ids(after)).toEqual(ids(before));
    },
  );

  propIt.prop([anyRows, index, fc.integer({ min: 1, max: 3 })])(
    "insertRows only adds rows, keeping the existing ones in order",
    (before, at, count) => {
      const after = insertRows(before, at, count);
      expect(after.length).toBe(before.length + count);
      expect(after.filter((row) => before.includes(row))).toEqual(before);
    },
  );

  propIt.prop([anyRows, index, index])(
    "deleteRows never leaves an unusable empty grid",
    (before, top, bottom) => {
      expect(deleteRows(before, top, bottom).length).toBeGreaterThan(0);
    },
  );
});
