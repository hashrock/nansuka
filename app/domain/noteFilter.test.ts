import { describe, expect, it } from "vitest";
import { filterNotesByTitle } from "./noteFilter";

const notes = [
  { id: "1", title: "会議メモ 9/9" },
  { id: "2", title: "Thank you for reaching out" },
  { id: "3", title: "翻訳ツールを作るとき" },
];

describe("filterNotesByTitle", () => {
  it("returns everything for an empty or blank query", () => {
    expect(filterNotesByTitle(notes, "")).toHaveLength(3);
    expect(filterNotesByTitle(notes, "   ")).toHaveLength(3);
  });

  it("matches a substring of the title", () => {
    expect(filterNotesByTitle(notes, "メモ").map((n) => n.id)).toEqual(["1"]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterNotesByTitle(notes, "  THANK ").map((n) => n.id)).toEqual(["2"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterNotesByTitle(notes, "存在しない")).toEqual([]);
  });
});
