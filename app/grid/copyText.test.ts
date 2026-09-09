import { describe, expect, it } from "vitest";
import {
  copyRange,
  countCopyableTranslations,
  selectionIncludesTranslated,
  translatedTextForCopy,
} from "./copyText";
import { COL_SOURCE, COL_TRANSLATED, createRow } from "./types";

const rows = [
  createRow("一つ目", "First"),
  createRow("二つ目", ""),
  createRow("三つ目", "  Third  "),
  createRow("四つ目", "Fourth"),
];

describe("translatedTextForCopy", () => {
  it("joins the translations of the selected rows with blank lines", () => {
    const text = translatedTextForCopy(rows, {
      top: 0,
      bottom: 3,
      left: COL_TRANSLATED,
      right: COL_TRANSLATED,
    });
    expect(text).toBe("First\n\nThird\n\nFourth");
  });

  it("skips rows whose translation is empty", () => {
    const text = translatedTextForCopy(rows, {
      top: 1,
      bottom: 1,
      left: COL_SOURCE,
      right: COL_TRANSLATED,
    });
    expect(text).toBe("");
  });

  it("ignores which column is selected", () => {
    const sourceOnly = translatedTextForCopy(rows, {
      top: 0,
      bottom: 0,
      left: COL_SOURCE,
      right: COL_SOURCE,
    });
    expect(sourceOnly).toBe("First");
  });
});

describe("countCopyableTranslations", () => {
  it("counts rows that have a translation inside the selection", () => {
    expect(
      countCopyableTranslations(rows, {
        top: 0,
        bottom: 3,
        left: COL_SOURCE,
        right: COL_TRANSLATED,
      }),
    ).toBe(3);
    expect(
      countCopyableTranslations(rows, {
        top: 1,
        bottom: 1,
        left: COL_SOURCE,
        right: COL_TRANSLATED,
      }),
    ).toBe(0);
  });
});

describe("selectionIncludesTranslated", () => {
  it("is true when the translated column is inside the rect", () => {
    expect(
      selectionIncludesTranslated({
        top: 0,
        bottom: 0,
        left: COL_SOURCE,
        right: COL_TRANSLATED,
      }),
    ).toBe(true);
    expect(
      selectionIncludesTranslated({
        top: 0,
        bottom: 0,
        left: COL_SOURCE,
        right: COL_SOURCE,
      }),
    ).toBe(false);
  });
});

describe("copyRange", () => {
  it("keeps the selection when it already contains a translation", () => {
    const rect = { top: 0, bottom: 0, left: COL_SOURCE, right: COL_SOURCE };
    expect(copyRange(rows, rect)).toEqual(rect);
  });

  it("falls back to the whole note when the selected rows have no translation", () => {
    const rect = { top: 1, bottom: 1, left: COL_SOURCE, right: COL_TRANSLATED };
    expect(copyRange(rows, rect)).toEqual({
      top: 0,
      bottom: 3,
      left: COL_SOURCE,
      right: COL_TRANSLATED,
    });
  });
});
