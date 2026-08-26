import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Row, Selection } from "./types";
import { singleCell } from "./selection";

const HISTORY_LIMIT = 100;

interface Snapshot {
  rows: Row[];
  selection: Selection;
}

interface State {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
}

type Action =
  | { type: "commit"; rows: Row[]; selection?: Selection }
  | { type: "select"; selection: Selection }
  | { type: "patch"; update: (rows: Row[]) => Row[] }
  | { type: "undo" }
  | { type: "redo" };

function reducer(state: State, action: Action): State {
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

interface Options {
  initialRows: Row[];
  /**
   * 行が変わるたびに呼ばれる。保存先 (ノートのオートセーブなど) は
   * 呼び出し側の関心事なので、ここでは持たない。
   */
  onPersist?: (rows: Row[]) => void;
}

export function useGridStore({ initialRows, onPersist }: Options) {
  const [state, dispatch] = useReducer(reducer, initialRows, (rows) => ({
    past: [],
    present: { rows, selection: singleCell({ row: 0, col: 0 }) },
    future: [],
  }));
  const { rows, selection } = state.present;

  // 初期値そのものは保存し直さない (開いただけで updatedAt が動くのを避ける)。
  const lastPersisted = useRef<Row[]>(initialRows);
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;

  useEffect(() => {
    if (lastPersisted.current === rows) return;
    lastPersisted.current = rows;
    persistRef.current?.(rows);
  }, [rows]);

  const commit = useCallback((next: Row[], nextSelection?: Selection) => {
    dispatch({ type: "commit", rows: next, selection: nextSelection });
  }, []);

  const select = useCallback((next: Selection) => {
    dispatch({ type: "select", selection: next });
  }, []);

  const patch = useCallback((update: (rows: Row[]) => Row[]) => {
    dispatch({ type: "patch", update });
  }, []);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return useMemo(
    () => ({
      rows,
      selection,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      commit,
      select,
      patch,
      undo,
      redo,
    }),
    [
      rows,
      selection,
      state.past.length,
      state.future.length,
      commit,
      select,
      patch,
      undo,
      redo,
    ],
  );
}
