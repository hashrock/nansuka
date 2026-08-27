import { describe, expect, it } from "vitest";
import { PROMPT_MAX_LENGTH, normalizePrompt } from "./prompt";

describe("normalizePrompt", () => {
  it("treats blank or non-string input as unset", () => {
    expect(normalizePrompt(undefined)).toBeNull();
    expect(normalizePrompt(null)).toBeNull();
    expect(normalizePrompt("   \n ")).toBeNull();
    expect(normalizePrompt(42)).toBeNull();
  });

  it("trims and caps the length", () => {
    expect(normalizePrompt("  Summarize.  ")).toBe("Summarize.");
    expect(normalizePrompt("x".repeat(PROMPT_MAX_LENGTH + 10))).toHaveLength(
      PROMPT_MAX_LENGTH,
    );
  });
});
