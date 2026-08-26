import { describe, expect, it } from "vitest";
import { DEFAULT_NOTE_TITLE, deriveNoteTitle } from "./noteTitle";

describe("deriveNoteTitle", () => {
  it("uses the first non-empty source", () => {
    expect(deriveNoteTitle(["", "  ", "Hello there"])).toBe("Hello there");
  });

  it("falls back when everything is blank", () => {
    expect(deriveNoteTitle([])).toBe(DEFAULT_NOTE_TITLE);
    expect(deriveNoteTitle(["", "   "])).toBe(DEFAULT_NOTE_TITLE);
  });

  it("collapses newlines so the title stays one line", () => {
    expect(deriveNoteTitle(["first\nsecond"])).toBe("first second");
  });

  it("truncates long text with an ellipsis", () => {
    const title = deriveNoteTitle(["a".repeat(60)]);
    expect(title).toBe(`${"a".repeat(40)}…`);
  });

  it("keeps text exactly at the limit intact", () => {
    expect(deriveNoteTitle(["a".repeat(40)])).toBe("a".repeat(40));
  });
});
