import {
  extendSelection,
  moveCell,
  moveCellWrapping,
  selectAll,
  singleCell,
} from "./selection";
import { COL_COUNT, type CellRef, type Selection } from "./types";

/** キーイベントから、移動の判断に要るものだけを取り出したもの。 */
export interface KeyChord {
  key: string;
  shift: boolean;
  /** Cmd (macOS) または Ctrl。 */
  mod: boolean;
}

/**
 * カーソル移動のキーだけを解釈して、次の選択を返す。担当外なら null。
 *
 * `preventDefault` やフォーカス制御と混ざると試せないので、選択の計算だけを
 * ここに置く。編集開始・クリップボード・削除・Undo は呼び出し側の担当。
 */
export function navigate(
  selection: Selection,
  chord: KeyChord,
  rowCount: number,
): Selection | null {
  const { focus } = selection;
  const { key, shift, mod } = chord;

  if (mod) {
    // 修飾キー付きで移動に関わるのは「すべて選択」だけ。
    return key.toLowerCase() === "a" ? selectAll(rowCount) : null;
  }

  /** shift を押していれば anchor を残して範囲を広げる。 */
  const to = (cell: CellRef): Selection =>
    extendSelection(selection, cell, shift);

  switch (key) {
    case "ArrowUp":
      return to(moveCell(focus, -1, 0, rowCount));
    case "ArrowDown":
      return to(moveCell(focus, 1, 0, rowCount));
    case "ArrowLeft":
      return to(moveCell(focus, 0, -1, rowCount));
    case "ArrowRight":
      return to(moveCell(focus, 0, 1, rowCount));
    // Tab は行末で折り返す。範囲は広げない。
    case "Tab":
      return singleCell(moveCellWrapping(focus, shift ? -1 : 1, rowCount));
    case "Home":
      return to({ row: focus.row, col: 0 });
    case "End":
      return to({ row: focus.row, col: COL_COUNT - 1 });
    case "Escape":
      return singleCell(focus);
    default:
      return null;
  }
}
