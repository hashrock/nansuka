import { fc, it as propIt } from "@fast-check/vitest";
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

/**
 * プロンプトの文言そのものは自然言語なので生成テストの対象外だが、
 * ノート設定から素通しで入ってくる値を切り詰める部分は境界そのもの。
 */
/** 文字列かどうかの一点でしか分岐しないので、型の代表だけ並べれば足りる。 */
const anyInput = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string(), { maxLength: 2 }),
  fc.object({ maxDepth: 1 }),
);
/** 上限で切る枝を通すために、上限をまたぐ長さの文字列も混ぜる。 */
const anyPrompt = fc.oneof(
  anyInput,
  fc
    .array(fc.constantFrom("a", " ", "\n", "日"), {
      minLength: PROMPT_MAX_LENGTH,
      maxLength: PROMPT_MAX_LENGTH + 20,
    })
    .map((chars) => chars.join("")),
);

describe("normalizePrompt properties", () => {
  propIt.prop([anyPrompt])("上限を超える文字列は返さない", (input) => {
    const prompt = normalizePrompt(input);
    expect(prompt === null || prompt.length <= PROMPT_MAX_LENGTH).toBe(true);
  });

  propIt.prop([anyPrompt])("2度通しても結果は変わらない (冪等)", (input) => {
    const once = normalizePrompt(input);
    expect(normalizePrompt(once)).toBe(once);
  });

  propIt.prop([anyPrompt])(
    "返すのは空でない、前後に空白のない文字列だけ",
    (input) => {
      const prompt = normalizePrompt(input);
      fc.pre(prompt !== null);
      expect(prompt).not.toBe("");
      expect(prompt).toBe(prompt.trim());
    },
  );
});
