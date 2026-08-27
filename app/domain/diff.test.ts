import { describe, expect, it } from "vitest";
import { diffChars } from "./diff";

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
    const after2 = diffChars(before, after)
      .filter((s) => s.type !== "del")
      .map((s) => s.text)
      .join("");
    expect(after2).toBe(after);
  });
});
