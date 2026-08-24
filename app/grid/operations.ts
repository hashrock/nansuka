import { COL_SOURCE, createRow, type Rect, type Row } from "./types";

/**
 * セルの値を書き換える。
 *
 * 原文を変えた行は訳文を捨てて再翻訳の対象に戻す (overridden も落とす)。
 * 訳文を直接書いた行は overridden を立て、以降の自動翻訳から保護する。
 */
export function setCell(
  rows: Row[],
  index: number,
  col: number,
  value: string,
): Row[] {
  const row = rows[index];
  if (!row) return rows;

  if (col === COL_SOURCE) {
    if (row.source === value) return rows;
    return replaceAt(rows, index, {
      ...row,
      source: value,
      translated: "",
      overridden: false,
    });
  }

  if (row.translated === value) return rows;
  return replaceAt(rows, index, {
    ...row,
    translated: value,
    overridden: value.trim() !== "",
  });
}

/** 選択範囲のセルを空にする。Delete / Backspace で使う。 */
export function clearCells(rows: Row[], rect: Rect): Row[] {
  let next = rows;
  for (let r = rect.top; r <= rect.bottom; r++) {
    for (let c = rect.left; c <= rect.right; c++) {
      next = setCell(next, r, c, "");
    }
  }
  return next;
}

export function insertRows(rows: Row[], at: number, count = 1): Row[] {
  const created = Array.from({ length: count }, () => createRow());
  const index = Math.min(Math.max(at, 0), rows.length);
  return [...rows.slice(0, index), ...created, ...rows.slice(index)];
}

export function deleteRows(rows: Row[], top: number, bottom: number): Row[] {
  const next = [...rows.slice(0, top), ...rows.slice(bottom + 1)];
  // 空のグリッドは操作不能になるので、必ず1行は残す。
  return next.length > 0 ? next : [createRow()];
}

/**
 * from..from+count-1 の行を to の位置へ移動する。
 * to は「移動対象を抜き取る前」のインデックスで指定する。
 */
export function moveRows(
  rows: Row[],
  from: number,
  count: number,
  to: number,
): Row[] {
  if (count <= 0) return rows;
  if (to >= from && to <= from + count) return rows;

  const moving = rows.slice(from, from + count);
  const rest = [...rows.slice(0, from), ...rows.slice(from + count)];
  // 抜き取りで前方のインデックスがずれる分を補正する。
  const target = to > from ? to - count : to;
  return [...rest.slice(0, target), ...moving, ...rest.slice(target)];
}

/**
 * 貼り付けたグリッドを (top, left) を起点に流し込む。
 * 足りない行は自動で追加する。
 */
export function pasteGrid(
  rows: Row[],
  top: number,
  left: number,
  grid: string[][],
): Row[] {
  if (grid.length === 0) return rows;

  let next = rows;
  const needed = top + grid.length - next.length;
  if (needed > 0) next = insertRows(next, next.length, needed);

  grid.forEach((cells, r) => {
    cells.forEach((value, c) => {
      const col = left + c;
      if (col > 1) return;
      next = setCell(next, top + r, col, value);
    });
  });

  return next;
}

/** 選択範囲を文字列のグリッドとして取り出す (コピー用)。 */
export function extractGrid(rows: Row[], rect: Rect): string[][] {
  const out: string[][] = [];
  for (let r = rect.top; r <= rect.bottom; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells: string[] = [];
    for (let c = rect.left; c <= rect.right; c++) {
      cells.push(c === COL_SOURCE ? row.source : row.translated);
    }
    out.push(cells);
  }
  return out;
}

/**
 * 翻訳結果を反映する。
 * 反映中に原文が書き換わった行と、手動編集された行は触らない。
 */
export function applyTranslations(
  rows: Row[],
  results: { id: string; source: string; translated: string }[],
): Row[] {
  if (results.length === 0) return rows;
  const byId = new Map(results.map((r) => [r.id, r]));

  let changed = false;
  const next = rows.map((row) => {
    const result = byId.get(row.id);
    if (!result) return row;
    if (row.overridden || row.source !== result.source) return row;
    if (row.translated === result.translated) return row;
    changed = true;
    return { ...row, translated: result.translated };
  });

  return changed ? next : rows;
}

function replaceAt(rows: Row[], index: number, row: Row): Row[] {
  const next = [...rows];
  next[index] = row;
  return next;
}
