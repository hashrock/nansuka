/**
 * クレジットの価格表。
 *
 * 実際の課金設計はまだないので、ここの数字は暫定。翻訳の重さは文字数にほぼ
 * 比例するため、段落ごとに文字数を階段状に切り上げて課金する。1文字でも
 * 1クレジットは取る（リクエスト自体にコストがあるため）。
 */
export const CHARS_PER_TRANSLATION_CREDIT = 200;
export const CHARS_PER_CONTEXT_CREDIT = 1000;

/** 空でない段落1つあたりの費用。 */
export function paragraphCost(text: string): number {
  const length = text.trim().length;
  if (length === 0) return 0;
  return Math.ceil(length / CHARS_PER_TRANSLATION_CREDIT);
}

/** 翻訳リクエスト全体の費用。空の段落は課金しない。 */
export function translationCost(paragraphs: string[]): number {
  return paragraphs.reduce((total, text) => total + paragraphCost(text), 0);
}

/** コンテキスト要約の費用。翻訳より粗い刻みにしてある。 */
export function contextCost(text: string): number {
  const length = text.trim().length;
  if (length === 0) return 0;
  return Math.ceil(length / CHARS_PER_CONTEXT_CREDIT);
}

export function canAfford(balance: number, cost: number): boolean {
  return balance >= cost;
}

/** 残高不足のときにクライアントへ返す説明。 */
export function insufficientCreditsMessage(
  balance: number,
  cost: number,
): string {
  return `クレジットが足りません (必要: ${cost} / 残高: ${balance})`;
}
