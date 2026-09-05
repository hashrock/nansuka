import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { COL_COUNT } from "./types";
import {
  GRID_CLIPBOARD_TYPE,
  padGrid,
  parseClipboard,
  parseParagraphs,
  parseTsv,
  readClipboardGrid,
  serializeTsv,
  writeClipboardGrid,
} from "./tsv";

/** コピー先・貼り付け元を差し替えられるようにした、その場のクリップボード。 */
function fakeClipboard(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    write: (type: string, value: string) => {
      data[type] = value;
    },
    read: (type: string) => data[type] ?? "",
  };
}

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

  it("treats the final newline as a terminator, not an extra row", () => {
    expect(parseTsv("a\nb\n")).toEqual([["a"], ["b"]]);
  });

  // 終端子を書かないツールからの貼り付けも読める。
  it("still reads input that omits the final terminator", () => {
    expect(parseTsv("a\nb")).toEqual([["a"], ["b"]]);
  });

  // 終端子のあとに改行がもう1つあれば、それは空の行。
  it("reads an empty row written before the terminator", () => {
    expect(parseTsv("a\n\n")).toEqual([["a"], [""]]);
    expect(parseTsv("\n")).toEqual([[""]]);
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

  // 空セルを引用符で書き出すツールからの貼り付け。空文字と違って
  // 「フィールドがある」ので、行として残す。
  it("keeps a quoted empty field as a row", () => {
    expect(parseTsv('""')).toEqual([[""]]);
    expect(parseTsv('a\tb\n""')).toEqual([["a", "b"], [""]]);
  });
});

describe("serializeTsv", () => {
  it("terminates every row, including the last", () => {
    expect(
      serializeTsv([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe("a\tb\nc\td\n");
    expect(serializeTsv([])).toBe("");
  });

  it("quotes values containing tabs, newlines or quotes", () => {
    expect(serializeTsv([["has\ttab"]])).toBe('"has\ttab"\n');
    expect(serializeTsv([["two\nlines"]])).toBe('"two\nlines"\n');
    expect(serializeTsv([['say "hi"']])).toBe('"say ""hi"""\n');
  });

  it("round-trips through parseTsv", () => {
    const grid = [
      ["日本語\tタブ", 'quote " here'],
      ["multi\nline", ""],
    ];
    expect(parseTsv(serializeTsv(grid))).toEqual(grid);
  });

  // 終端子方式にした本題。区切り子のままだと読み直しで消えていた。
  it("keeps a trailing empty row in a single-column grid", () => {
    expect(parseTsv(serializeTsv([["a"], [""]]))).toEqual([["a"], [""]]);
  });

  // 引用符で空セルを囲む案だと、ここが `""` という文字列になって貼り付いた。
  it("never writes a bare pair of quotes for an empty cell", () => {
    expect(serializeTsv([[""]])).not.toContain('"');
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

describe("parseParagraphs", () => {
  it("splits on blank lines, keeping single newlines inside a paragraph", () => {
    expect(parseParagraphs("a1\na2\n\nb\n\n\nc")).toEqual([["a1\na2"], ["b"], ["c"]]);
  });

  it("treats whitespace-only lines as blank and trims paragraphs", () => {
    expect(parseParagraphs("  a  \r\n \r\nb\n")).toEqual([["a"], ["b"]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseParagraphs("\n\n")).toEqual([]);
  });
});

describe("parseClipboard", () => {
  it("uses TSV when the text contains tabs", () => {
    expect(parseClipboard("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("uses paragraphs otherwise", () => {
    expect(parseClipboard("a\nb\n\nc")).toEqual([["a\nb"], ["c"]]);
  });
});

describe("readClipboardGrid", () => {
  it("reads the app's own copy as TSV, tabs or not", () => {
    const clipboard = fakeClipboard();
    writeClipboardGrid(clipboard.write, [["a"], [""]]);
    // タブがないので、text/plain だけなら段落と誤読される形。
    expect(parseClipboard(clipboard.read("text/plain"))).toEqual([["a"]]);
    expect(readClipboardGrid(clipboard.read)).toEqual([["a"], [""]]);
  });

  it("keeps one column per row instead of merging them into a paragraph", () => {
    const clipboard = fakeClipboard();
    writeClipboardGrid(clipboard.write, [["one"], ["two"]]);
    expect(readClipboardGrid(clipboard.read)).toEqual([["one"], ["two"]]);
  });

  it("falls back to the heuristic for text from other apps", () => {
    expect(readClipboardGrid(fakeClipboard({ "text/plain": "a\tb" }).read))
      .toEqual([["a", "b"]]);
    expect(readClipboardGrid(fakeClipboard({ "text/plain": "one\n\ntwo" }).read))
      .toEqual([["one"], ["two"]]);
  });

  it("still writes plain TSV for other apps to read", () => {
    const clipboard = fakeClipboard();
    writeClipboardGrid(clipboard.write, [["a", "b"]]);
    expect(clipboard.read("text/plain")).toBe("a\tb\n");
    expect(clipboard.read(GRID_CLIPBOARD_TYPE)).toBe("a\tb\n");
  });
});

/** 例示テストで拾いきれない組み合わせを fast-check に任せる。 */
const cell = fc
  .array(fc.constantFrom("a", "b", " ", "\t", "\n", "\r\n", '"', "日"), {
    maxLength: 5,
  })
  .map((chars) => chars.join(""));
const row = fc.array(cell, { minLength: COL_COUNT, maxLength: COL_COUNT });
const grid = fc.array(row, { maxLength: 4 });
/** 幅を固定しないグリッド。1列や幅がまちまちの入力も含む。 */
const anyGrid = fc.array(fc.array(cell, { minLength: 1, maxLength: 3 }), {
  maxLength: 4,
});

describe("tsv properties", () => {
  /**
   * アプリが実際に通す経路 (コピー → クリップボード → 貼り付け) の往復。
   * 1列の選択もできるので幅は固定しない。text/plain だけを見ていた頃は
   * ここでタブのない TSV が段落として読まれ、空行が落ちていた。
   */
  propIt.prop([anyGrid])(
    "copying a selection and pasting it back reproduces the grid",
    (original) => {
      const clipboard = fakeClipboard();
      writeClipboardGrid(clipboard.write, original);
      expect(readClipboardGrid(clipboard.read)).toEqual(original);
    },
  );

  propIt.prop([grid])(
    "a two-column copy still reads back from text/plain alone",
    (original) => {
      const pasted = padGrid(parseClipboard(serializeTsv(original)), COL_COUNT);
      expect(pasted).toEqual(original);
    },
  );

  /**
   * 終端子方式にしたので、幅を COL_COUNT に限らなくても往復が一致する。
   * 1列のグリッドや末尾の空行も書き分けられる。
   */
  propIt.prop([anyGrid])(
    "serializeTsv and parseTsv round-trip for a grid of any width",
    (original) => {
      expect(parseTsv(serializeTsv(original))).toEqual(original);
    },
  );

  propIt.prop([anyGrid])(
    "the written text is a sequence of terminated rows",
    (original) => {
      const text = serializeTsv(original);
      expect(text === "" || text.endsWith("\n")).toBe(true);
    },
  );

  // 引用符を増やさずに曖昧さを解いた、という約束そのもの。
  propIt.prop([anyGrid])(
    "quoting is only used for cells that actually need it",
    (original) => {
      fc.pre(
        original.every((cells) =>
          cells.every((value) => !/[\t\n\r"]/.test(value)),
        ),
      );
      expect(serializeTsv(original)).not.toContain('"');
    },
  );

  propIt.prop([grid, fc.integer({ min: 1, max: 4 })])(
    "padGrid makes every row exactly the given width",
    (original, width) => {
      const padded = padGrid(original, width);
      expect(padded.map((row) => row.length)).toEqual(original.map(() => width));
    },
  );
});
