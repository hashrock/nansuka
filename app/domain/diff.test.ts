import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { diffChars, type DiffSegment } from "./diff";

function join(segments: DiffSegment[], skip: DiffSegment["type"]): string {
  return segments
    .filter((segment) => segment.type !== skip)
    .map((segment) => segment.text)
    .join("");
}

describe("diffChars", () => {
  it("returns one same segment for identical text", () => {
    expect(diffChars("abc", "abc")).toEqual([{ type: "same", text: "abc" }]);
    expect(diffChars("", "")).toEqual([]);
  });

  it("marks inserted and deleted runs", () => {
    expect(diffChars("こんにちわ世界", "こんにちは世界")).toEqual([
      { type: "same", text: "こんにち" },
      { type: "del", text: "わ" },
      { type: "ins", text: "は" },
      { type: "same", text: "世界" },
    ]);
  });

  it("handles pure insertions at the end", () => {
    expect(diffChars("値段が高い", "値段が高いです")).toEqual([
      { type: "same", text: "値段が高い" },
      { type: "ins", text: "です" },
    ]);
  });

  it("reconstructs after from same+ins segments", () => {
    const before = "The quick brown fox";
    const after = "The slow brown cat";
    expect(join(diffChars(before, after), "del")).toBe(after);
  });
});

/**
 * 差分は画面に出す前の中間表現なので、文字を落としたり増やしたりすると
 * 校正の判断材料そのものが狂う。小さな語彙で当たりの多い文字列を作り、
 * LCS の分岐を踏ませる。
 */
const text = fc
  .array(fc.constantFrom("a", "b", "c", " ", "、", "🙂"), { maxLength: 16 })
  .map((chars) => chars.join(""));

describe("diffChars properties", () => {
  propIt.prop([text, text])(
    "keeps both sides reconstructible from the segments",
    (before, after) => {
      const segments = diffChars(before, after);
      expect(join(segments, "ins")).toBe(before);
      expect(join(segments, "del")).toBe(after);
    },
  );

  propIt.prop([text, text])(
    "never emits two adjacent segments of the same type",
    (before, after) => {
      const types = diffChars(before, after).map((segment) => segment.type);
      expect(types.filter((type, i) => type === types[i - 1])).toEqual([]);
    },
  );
});
