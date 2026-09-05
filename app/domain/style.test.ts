import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE,
  LENGTH_MAX,
  LENGTH_MIN,
  isDefaultStyle,
  lengthRatio,
  lengthToSlider,
  normalizeStyle,
  sliderToLength,
  previewLength,
  styleCacheKey,
  styleInstructions,
} from "./style";

describe("normalizeStyle", () => {
  it("fills missing or invalid values with the midpoint and clamps", () => {
    expect(normalizeStyle(undefined)).toEqual(DEFAULT_STYLE);
    expect(normalizeStyle({ length: 250, concise: -3, friendly: "x" })).toEqual({
      length: 200,
      concise: 0,
      friendly: 50,
    });
  });
});

describe("styleInstructions", () => {
  it("is empty near the midpoint", () => {
    expect(styleInstructions(DEFAULT_STYLE)).toBe("");
    expect(styleInstructions({ length: 108, concise: 45, friendly: 50 })).toBe("");
  });

  it("emits one line per adjusted parameter", () => {
    const text = styleInstructions({ length: 50, concise: 50, friendly: 100 });
    expect(text).toMatch(/^Style requirements:/);
    expect(text).toMatch(/about 50% of the source length/);
    expect(text).toMatch(/casual/);
    expect(text).not.toMatch(/concise/);
  });
});

describe("styleInstructions with a custom prompt", () => {
  it("tells the model the task instructions win", () => {
    const text = styleInstructions({ length: 200, concise: 50, friendly: 50 }, true);
    expect(text).toMatch(/secondary to the task instructions/);
    expect(styleInstructions(DEFAULT_STYLE, true)).toBe("");
  });

  it("caps the length when shortening", () => {
    expect(styleInstructions({ length: 50, concise: 50, friendly: 50 })).toMatch(
      /must not exceed 60%/,
    );
  });
});

describe("styleCacheKey", () => {
  it("is empty for the default so old cache entries stay valid", () => {
    expect(isDefaultStyle(DEFAULT_STYLE)).toBe(true);
    expect(styleCacheKey(DEFAULT_STYLE)).toBe("");
    expect(styleCacheKey({ length: 60, concise: 50, friendly: 50 })).toBe("|L60C50F50");
  });
});

describe("previewLength", () => {
  it("maps percent to a ratio", () => {
    expect(lengthRatio(50)).toBe(0.5);
    expect(lengthRatio(100)).toBe(1);
    expect(lengthRatio(200)).toBe(2);
  });

  it("puts 100% at the middle of the slider", () => {
    expect(sliderToLength(0)).toBe(50);
    expect(sliderToLength(50)).toBe(100);
    expect(sliderToLength(100)).toBe(200);
    expect(lengthToSlider(50)).toBe(0);
    expect(lengthToSlider(100)).toBe(50);
    expect(lengthToSlider(200)).toBe(100);
  });

  it("returns the text untouched at ratio 1", () => {
    expect(previewLength("hello world", 1)).toBe("hello world");
  });

  it("truncates words with an ellipsis when shortening", () => {
    expect(previewLength("one two three four", 0.5)).toBe("one two…");
  });

  it("repeats words from the start when lengthening", () => {
    const out = previewLength("one two", 2);
    expect(out.length).toBeGreaterThan("one two".length);
    expect(out.startsWith("one two")).toBe(true);
  });
});

/**
 * 文章調整の値は、リクエスト本文や localStorage から素通しで入ってくる。
 * `normalizeStyle` はその境界を守る唯一の関数なので、何を渡されても
 * 範囲内の値を返しきることを生成テストで押さえる。
 */
const anyStyle = fc.record({
  length: fc.oneof(fc.integer(), fc.double(), fc.string(), fc.constant(null)),
  concise: fc.oneof(fc.integer(), fc.double(), fc.string(), fc.constant(null)),
  friendly: fc.oneof(fc.integer(), fc.double(), fc.string(), fc.constant(null)),
});
/**
 * オブジェクトですらない入力も来る (壊れた localStorage、雑な JSON)。
 * 分岐は「有限の数値かどうか」の一点なので、型の代表だけ並べれば足りる。
 */
const anyInput = fc.oneof(
  anyStyle,
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.array(fc.integer(), { maxLength: 2 }),
);
const validStyle = fc.record({
  length: fc.integer({ min: LENGTH_MIN, max: LENGTH_MAX }),
  concise: fc.integer({ min: 0, max: 100 }),
  friendly: fc.integer({ min: 0, max: 100 }),
});

describe("style properties", () => {
  propIt.prop([anyInput])("何を渡しても範囲内の整数に収まる", (input) => {
    const style = normalizeStyle(input);
    expect(Number.isInteger(style.length)).toBe(true);
    expect(style.length).toBeGreaterThanOrEqual(LENGTH_MIN);
    expect(style.length).toBeLessThanOrEqual(LENGTH_MAX);
    for (const value of [style.concise, style.friendly]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  propIt.prop([anyInput])("2度通しても結果は変わらない (冪等)", (input) => {
    const once = normalizeStyle(input);
    expect(normalizeStyle(once)).toEqual(once);
  });

  propIt.prop([validStyle])(
    "スライダー位置と % は往復する",
    (style) => {
      const position = lengthToSlider(style.length);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(100);
      // 対数で刻んで丸めるので、1 段ぶんのずれは許容する。
      expect(Math.abs(sliderToLength(position) - style.length)).toBeLessThanOrEqual(2);
    },
  );

  propIt.prop([fc.integer({ min: 0, max: 100 })])(
    "スライダーは押した向きに動く (単調)",
    (position) => {
      const here = sliderToLength(position);
      expect(here).toBeGreaterThanOrEqual(LENGTH_MIN);
      expect(here).toBeLessThanOrEqual(LENGTH_MAX);
      if (position < 100) {
        expect(sliderToLength(position + 1)).toBeGreaterThanOrEqual(here);
      }
    },
  );

  propIt.prop([validStyle, validStyle])(
    "違う設定は違うキャッシュキーになる (訳文が混ざらない)",
    (a, b) => {
      fc.pre(JSON.stringify(a) !== JSON.stringify(b));
      expect(styleCacheKey(a)).not.toBe(styleCacheKey(b));
    },
  );

  propIt.prop([fc.string({ maxLength: 40 }), fc.double({ min: 0.1, max: 3, noNaN: true })])(
    "プレビューは必ず文字列を返し、空文字を膨らませたりしない",
    (text, ratio) => {
      const out = previewLength(text, ratio);
      expect(typeof out).toBe("string");
      if (text === "") expect(out).toBe("");
    },
  );

  propIt.prop([validStyle])("独自プロンプト時だけ優先順位の一文が付く", (style) => {
    const plain = styleInstructions(style, false);
    const custom = styleInstructions(style, true);
    // 指示が1つも出ないときは、どちらも空。
    expect(plain === "").toBe(custom === "");
    expect(custom.startsWith(plain)).toBe(true);
    if (plain !== "") {
      expect(custom).toMatch(/secondary to the task instructions/);
    }
  });
});
