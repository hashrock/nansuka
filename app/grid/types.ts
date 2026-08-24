/** 原文と訳文を1行に束ねたグリッドの行。 */
export interface Row {
  id: string;
  source: string;
  translated: string;
  /** 訳文を手で書き換えた行。原文が変わるまで自動翻訳で上書きしない。 */
  overridden: boolean;
}

/** 0 = 原文カラム, 1 = 訳文カラム。 */
export const COL_SOURCE = 0;
export const COL_TRANSLATED = 1;
export const COL_COUNT = 2;

export interface CellRef {
  row: number;
  col: number;
}

/** anchor は選択の起点、focus は現在のカーソル位置。 */
export interface Selection {
  anchor: CellRef;
  focus: CellRef;
}

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

let idCounter = 0;

export function createRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `row-${idCounter}`;
}

export function createRow(source = "", translated = ""): Row {
  return {
    id: createRowId(),
    source,
    translated,
    overridden: translated !== "",
  };
}

export function getCell(row: Row, col: number): string {
  return col === COL_SOURCE ? row.source : row.translated;
}

/**
 * 旧バージョンの単一テキストエリア (空行区切り) を行に変換する。
 * 移行のほか、原文カラムへの複数段落貼り付けでも使う。
 */
export function rowsFromText(text: string): Row[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => createRow(p));
}
