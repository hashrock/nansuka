import { COL_TRANSLATED, type Rect, type Row } from "./types";

/**
 * ツールバーの「訳文をコピー」で書き出す本文。
 *
 * ユーザテスト (#8) で、コピーが右クリックメニューにしか無く見つけられなかった。
 * 表計算ソフトのセルコピー (TSV) とは別に、訳文だけを段落として持ち出す
 * 経路を用意する。選択中の行の訳文を空行区切りで並べ、空の行は飛ばす。
 */
export function translatedTextForCopy(rows: readonly Row[], rect: Rect): string {
  return rows
    .slice(rect.top, rect.bottom + 1)
    .map((row) => row.translated.trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

/**
 * 「訳文をコピー」が対象にする範囲。選択中の行に訳文があればその行、無ければ
 * ノート全体。翻訳直後はカーソルが次の空行に移っているので、そのままでも
 * 押せるようにする。
 */
export function copyRange(rows: readonly Row[], rect: Rect): Rect {
  if (countCopyableTranslations(rows, rect) > 0) return rect;
  return { top: 0, bottom: rows.length - 1, left: rect.left, right: rect.right };
}

/** 「訳文をコピー」の対象行数。0 ならボタンを無効にする。 */
export function countCopyableTranslations(
  rows: readonly Row[],
  rect: Rect,
): number {
  return rows
    .slice(rect.top, rect.bottom + 1)
    .filter((row) => row.translated.trim().length > 0).length;
}

/**
 * 訳文カラムだけを選んでいるか、訳文カラムを含む行選択か。
 * どちらでも「訳文をコピー」は同じ動きにするので、列の判定はしない。
 * 将来、原文だけを選んだときに文言を変えたくなったら使う。
 */
export function selectionIncludesTranslated(rect: Rect): boolean {
  return rect.left <= COL_TRANSLATED && COL_TRANSLATED <= rect.right;
}
