import { COL_COUNT, type CellRef, type Rect, type Selection } from "./types";

export function cellsEqual(a: CellRef, b: CellRef): boolean {
  return a.row === b.row && a.col === b.col;
}

export function singleCell(cell: CellRef): Selection {
  return { anchor: cell, focus: cell };
}

export function toRect(selection: Selection): Rect {
  const { anchor, focus } = selection;
  return {
    top: Math.min(anchor.row, focus.row),
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.col, focus.col),
    right: Math.max(anchor.col, focus.col),
  };
}

export function rectContains(rect: Rect, row: number, col: number): boolean {
  return (
    row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right
  );
}

export function isSingleCell(selection: Selection): boolean {
  return cellsEqual(selection.anchor, selection.focus);
}

export function clampCell(cell: CellRef, rowCount: number): CellRef {
  const maxRow = Math.max(0, rowCount - 1);
  return {
    row: Math.min(Math.max(cell.row, 0), maxRow),
    col: Math.min(Math.max(cell.col, 0), COL_COUNT - 1),
  };
}

/** 矢印キーによる移動。グリッドの端では止まる。 */
export function moveCell(
  cell: CellRef,
  dRow: number,
  dCol: number,
  rowCount: number,
): CellRef {
  return clampCell({ row: cell.row + dRow, col: cell.col + dCol }, rowCount);
}

/**
 * Tab / Shift+Tab の移動。行末で次の行の先頭へ折り返す。
 * グリッドの末尾を越える場合は動かさない (行追加は呼び出し側の判断)。
 */
export function moveCellWrapping(
  cell: CellRef,
  delta: number,
  rowCount: number,
): CellRef {
  const flat = cell.row * COL_COUNT + cell.col + delta;
  if (flat < 0 || flat >= rowCount * COL_COUNT) return cell;
  return { row: Math.floor(flat / COL_COUNT), col: flat % COL_COUNT };
}

export function selectRow(row: number): Selection {
  return {
    anchor: { row, col: 0 },
    focus: { row, col: COL_COUNT - 1 },
  };
}

export function selectAll(rowCount: number): Selection {
  return {
    anchor: { row: 0, col: 0 },
    focus: { row: Math.max(0, rowCount - 1), col: COL_COUNT - 1 },
  };
}

/** 選択範囲を rowCount に収まるよう切り詰める (行削除後などに使う)。 */
export function clampSelection(
  selection: Selection,
  rowCount: number,
): Selection {
  return {
    anchor: clampCell(selection.anchor, rowCount),
    focus: clampCell(selection.focus, rowCount),
  };
}
