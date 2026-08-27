/**
 * 文章調整パネルのパラメータ。各値は 0〜100 で、50 が「指定なし」。
 * サーバーではプロンプトの指示に、クライアントでは簡易プレビューに使う。
 */
export interface StyleParams {
  /** 訳文の長さ。原文に対する % (50〜200)。100 が指定なし。 */
  length: number;
  /** 簡潔さ。低いほど説明的、高いほど簡潔。 */
  concise: number;
  /** フレンドリーさ。低いほどフォーマル、高いほどくだけた調子。 */
  friendly: number;
}

export const STYLE_MID = 50;
export const LENGTH_MIN = 50;
export const LENGTH_DEFAULT = 100;
export const LENGTH_MAX = 200;

export const DEFAULT_STYLE: StyleParams = {
  length: LENGTH_DEFAULT,
  concise: STYLE_MID,
  friendly: STYLE_MID,
};

function clampTo(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clamp(value: unknown): number {
  return clampTo(value, 0, 100, STYLE_MID);
}

function clampLength(value: unknown): number {
  return clampTo(value, LENGTH_MIN, LENGTH_MAX, LENGTH_DEFAULT);
}

/** 外から来た値 (リクエスト本文や localStorage) を安全な形に整える。 */
export function normalizeStyle(input: unknown): StyleParams {
  const obj = (input ?? {}) as Partial<Record<keyof StyleParams, unknown>>;
  return {
    length: clampLength(obj.length),
    concise: clamp(obj.concise),
    friendly: clamp(obj.friendly),
  };
}

export function isDefaultStyle(style: StyleParams): boolean {
  return (
    style.length === LENGTH_DEFAULT &&
    style.concise === STYLE_MID &&
    style.friendly === STYLE_MID
  );
}

/** 翻訳キャッシュのキーに混ぜる文字列。既定値なら空 (従来のキャッシュと互換)。 */
export function styleCacheKey(style: StyleParams): string {
  return isDefaultStyle(style)
    ? ""
    : `|L${style.length}C${style.concise}F${style.friendly}`;
}

/** 中央から離れているほど強い指示にする。中央付近 (±10) は指示なし。 */
function pick(value: number, low: string, slightlyLow: string, slightlyHigh: string, high: string): string | null {
  if (value <= 15) return low;
  if (value <= 40) return slightlyLow;
  if (value >= 85) return high;
  if (value >= 60) return slightlyHigh;
  return null;
}

/** プロンプトに足す指示。指定がなければ空文字。 */
export function styleInstructions(style: StyleParams): string {
  const lines = [
    lengthInstruction(style.length),
    pick(
      style.concise,
      "Use rich, descriptive, explanatory phrasing.",
      "Prefer slightly more descriptive phrasing.",
      "Prefer slightly more direct phrasing.",
      "Be as concise and direct as possible; avoid filler and redundancy.",
    ),
    pick(
      style.friendly,
      "Use a formal, polite, business-like tone.",
      "Use a slightly formal tone.",
      "Use a slightly warm, friendly tone.",
      "Use a warm, casual, friendly tone as if talking to a close colleague.",
    ),
  ].filter((line): line is string => line !== null);

  if (lines.length === 0) return "";
  return `Style requirements:\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/** 原文に対する % を指示文にする。100% 付近 (±10) は指示なし。 */
function lengthInstruction(percent: number): string | null {
  if (Math.abs(percent - LENGTH_DEFAULT) <= 10) return null;
  const how =
    percent < LENGTH_DEFAULT
      ? "keeping only the essential meaning"
      : "elaborating with natural detail while staying faithful to the meaning";
  return `Make each translation about ${percent}% of the source length, ${how}.`;
}

/** % 指定を倍率にする (50 → 0.5x, 100 → 1x, 200 → 2x)。 */
export function lengthRatio(percent: number): number {
  return clampLength(percent) / 100;
}

/**
 * スライダー位置 (0〜100) と % の相互変換。100% が中央に来るよう対数で刻む。
 * 0 → 50%, 50 → 100%, 100 → 200%。
 */
export function sliderToLength(position: number): number {
  const p = clamp(position) / 100;
  return clampLength(LENGTH_MIN * Math.pow(LENGTH_MAX / LENGTH_MIN, p));
}

export function lengthToSlider(percent: number): number {
  const ratio = clampLength(percent) / LENGTH_MIN;
  return Math.round((Math.log(ratio) / Math.log(LENGTH_MAX / LENGTH_MIN)) * 100);
}

function segmentWords(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  // 空白区切りにフォールバック。区切りも残して結合時に復元する。
  return text.split(/(\s+)/).filter((s) => s.length > 0);
}

/**
 * 長さスライダーをドラッグしている間の簡易プレビュー。
 * 単語単位で切り詰める・繰り返すだけの雑な近似で、正確さは求めない。
 * `ratio` は現在の訳文に対する倍率 (1 なら変更なし)。
 */
export function previewLength(text: string, ratio: number): string {
  if (!text || Math.abs(ratio - 1) < 0.02) return text;
  const words = segmentWords(text);
  const target = Math.max(1, Math.round(words.length * ratio));

  if (target < words.length) {
    return words.slice(0, target).join("").trimEnd() + "…";
  }

  // 先頭から単語を繰り返し足して水増しする。
  const out = [...words];
  let i = 0;
  while (out.length < target) {
    out.push(words[i % words.length]);
    i += 1;
  }
  return out.join("");
}
