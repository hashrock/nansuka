import { describe, expect, it } from "vitest";
import {
  DEFAULT_STYLE,
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
