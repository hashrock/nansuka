import { describe, expect, it } from "vitest";
import {
  CHARS_PER_CONTEXT_CREDIT,
  CHARS_PER_TRANSLATION_CREDIT,
  canAfford,
  contextCost,
  paragraphCost,
  translationCost,
} from "./credits";

describe("paragraphCost", () => {
  it("charges nothing for blank text", () => {
    expect(paragraphCost("")).toBe(0);
    expect(paragraphCost("   \n  ")).toBe(0);
  });

  it("charges one credit for anything up to the first step", () => {
    expect(paragraphCost("a")).toBe(1);
    expect(paragraphCost("a".repeat(CHARS_PER_TRANSLATION_CREDIT))).toBe(1);
  });

  it("steps up once past the boundary", () => {
    expect(paragraphCost("a".repeat(CHARS_PER_TRANSLATION_CREDIT + 1))).toBe(2);
    expect(paragraphCost("a".repeat(CHARS_PER_TRANSLATION_CREDIT * 3))).toBe(3);
  });

  it("ignores surrounding whitespace", () => {
    expect(paragraphCost(`  ${"a".repeat(10)}  `)).toBe(1);
  });
});

describe("translationCost", () => {
  it("sums the paragraphs", () => {
    expect(translationCost(["a", "b", "c"])).toBe(3);
  });

  it("skips empty paragraphs", () => {
    expect(translationCost(["a", "", "   ", "b"])).toBe(2);
  });

  it("is zero for an empty request", () => {
    expect(translationCost([])).toBe(0);
  });
});

describe("contextCost", () => {
  it("uses a coarser step than translation", () => {
    expect(contextCost("a".repeat(CHARS_PER_CONTEXT_CREDIT))).toBe(1);
    expect(contextCost("a".repeat(CHARS_PER_CONTEXT_CREDIT + 1))).toBe(2);
  });

  it("charges nothing for blank text", () => {
    expect(contextCost("  ")).toBe(0);
  });
});

describe("canAfford", () => {
  it("allows spending the exact balance", () => {
    expect(canAfford(5, 5)).toBe(true);
  });

  it("rejects going negative", () => {
    expect(canAfford(4, 5)).toBe(false);
  });
});
