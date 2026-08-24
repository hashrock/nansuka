import { describe, expect, it } from "vitest";
import { padGrid, parseTsv, serializeTsv } from "./tsv";

describe("parseTsv", () => {
  it("splits on tabs and newlines", () => {
    expect(parseTsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("treats CRLF as a single row break", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does not emit a trailing empty row", () => {
    expect(parseTsv("a\nb\n")).toEqual([["a"], ["b"]]);
  });

  it("keeps empty fields", () => {
    expect(parseTsv("a\t\tb")).toEqual([["a", "", "b"]]);
  });

  it("unwraps quoted fields containing tabs and newlines", () => {
    expect(parseTsv('"line1\nline2"\tplain')).toEqual([
      ["line1\nline2", "plain"],
    ]);
    expect(parseTsv('"has\ttab"\tnext')).toEqual([["has\ttab", "next"]]);
  });

  it("collapses doubled quotes inside a quoted field", () => {
    expect(parseTsv('"say ""hi"""')).toEqual([['say "hi"']]);
  });

  it("treats a quote in the middle of a field as a literal", () => {
    expect(parseTsv('a"b\tc')).toEqual([['a"b', "c"]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseTsv("")).toEqual([]);
  });
});

describe("serializeTsv", () => {
  it("joins plain values without quoting", () => {
    expect(
      serializeTsv([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe("a\tb\nc\td");
  });

  it("quotes values containing tabs, newlines or quotes", () => {
    expect(serializeTsv([["has\ttab"]])).toBe('"has\ttab"');
    expect(serializeTsv([["two\nlines"]])).toBe('"two\nlines"');
    expect(serializeTsv([['say "hi"']])).toBe('"say ""hi"""');
  });

  it("round-trips through parseTsv", () => {
    const grid = [
      ["日本語\tタブ", 'quote " here'],
      ["multi\nline", ""],
    ];
    expect(parseTsv(serializeTsv(grid))).toEqual(grid);
  });
});

describe("padGrid", () => {
  it("pads short rows and truncates long ones", () => {
    expect(padGrid([["a"], ["b", "c", "d"]], 2)).toEqual([
      ["a", ""],
      ["b", "c"],
    ]);
  });
});
