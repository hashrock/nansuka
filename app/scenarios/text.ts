import { createRow, type Row } from "../grid/types";

/** 原文だけの行。 */
export function source(text: string): Row {
  return createRow(text);
}

/** 原文と自動翻訳された訳文の行。 */
export function translated(text: string, translation: string): Row {
  const row = createRow(text, translation);
  row.overridden = false;
  return row;
}

/** 訳文を手で直した行。原文が変わるまで再翻訳で上書きされない。 */
export function overridden(text: string, translation: string): Row {
  return createRow(text, translation);
}

/** 指定した文字数になるまで文を繰り返して長い段落を作る。 */
export function longParagraph(sentence: string, minLength: number): string {
  let out = "";
  while (out.length < minLength) out += sentence;
  return out;
}

export const JA_ARTICLE = [
  "翻訳ツールを作るとき、いちばん難しいのは翻訳そのものではなく、原文と訳文をどう並べて見せるかだった。",
  "段落ごとに左右に並べると、どこまで訳したかが一目で分かる。逆に一つの大きなテキストエリアだと、修正した箇所を探すだけで疲れてしまう。",
  "そこで表計算ソフトのようなグリッドにした。左の列に原文を貼ると、右の列に訳文が埋まっていく。",
  "訳文を手で直した行には印が付き、原文を変えない限り自動翻訳で上書きされない。",
  "この仕組みは単純だが、実際に使ってみると手戻りが減って、翻訳の作業時間が半分ほどになった。",
];

export const EN_ARTICLE = [
  "Thank you for reaching out about the release schedule.",
  "We plan to ship the first beta next Tuesday, assuming the remaining layout issues on narrow screens are resolved by then.",
  "Could you confirm whether your team needs the Japanese UI strings before the beta, or if the following week is acceptable?",
  "Best regards,\nMika",
];

export const EN_TRANSLATIONS = [
  "リリーススケジュールについてご連絡いただきありがとうございます。",
  "狭い画面でのレイアウトの問題が解決されていれば、来週火曜日に最初のベータ版を出す予定です。",
];

export const JA_TRANSLATIONS = [
  "When building a translation tool, the hardest part was not the translation itself but how to present the source and target text side by side.",
  "Laying paragraphs out side by side makes it obvious at a glance how far you have translated. With one large text area, you get tired just hunting for the parts you changed.",
  "So we made it a grid, like a spreadsheet. Paste the source into the left column and translations fill in on the right.",
  "Rows whose translation you edited by hand are marked and will not be overwritten by automatic translation until the source changes.",
  "The mechanism is simple, but in practice it cut the amount of rework and roughly halved the time spent translating.",
];
