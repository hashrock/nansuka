import type { Row, Selection } from "./types";

/** これを超えた分の古いスナップショットは捨てる。 */
export const HISTORY_LIMIT = 100;

/** Undo の単位。行と選択をひとまとめに巻き戻す。 */
export interface Snapshot {
  rows: Row[];
  selection: Selection;
}

export interface HistoryState {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
}

export type HistoryAction =
  | { type: "commit"; rows: Row[]; selection?: Selection }
  | { type: "select"; selection: Selection }
  | { type: "patch"; update: (rows: Row[]) => Row[] }
  | { type: "undo" }
  | { type: "redo" };

export function initHistory(present: Snapshot): HistoryState {
  return { past: [], present, future: [] };
}

/**
 * 行と選択の履歴を持つ状態機械。
 *
 * React には依存しないので、アクション列を直接流し込んでテストできる。
 * 変化がないアクションは同じ state をそのまま返す (再描画を起こさない)。
 */
export function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.type) {
    case "commit": {
      const selection = action.selection ?? state.present.selection;
      if (
        action.rows === state.present.rows &&
        selection === state.present.selection
      ) {
        return state;
      }
      // 行が変わらない選択だけの移動は履歴に積まない。
      if (action.rows === state.present.rows) {
        return { ...state, present: { rows: action.rows, selection } };
      }
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: { rows: action.rows, selection },
        future: [],
      };
    }

    case "select": {
      if (action.selection === state.present.selection) return state;
      return {
        ...state,
        present: { ...state.present, selection: action.selection },
      };
    }

    // 翻訳結果の反映など、ユーザー操作ではない更新は履歴を汚さない。
    case "patch": {
      const rows = action.update(state.present.rows);
      if (rows === state.present.rows) return state;
      return { ...state, present: { ...state.present, rows } };
    }

    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
      };
    }
  }
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}
