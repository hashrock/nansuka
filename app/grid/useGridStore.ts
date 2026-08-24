import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { createRow, rowsFromText, type Row, type Selection } from "./types";
import { singleCell } from "./selection";

const ROWS_KEY = "nansuka-rows";
/** 旧・単一テキストエリア版の保存先。初回だけ読んで行に移行する。 */
const LEGACY_INPUT_KEY = "nansuka-input";
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

function loadRows(): Row[] {
  try {
    const stored = localStorage.getItem(ROWS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Row[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((row) => ({
          id: row.id ?? createRow().id,
          source: row.source ?? "",
          translated: row.translated ?? "",
          overridden: Boolean(row.overridden),
        }));
      }
    }

    const legacy = localStorage.getItem(LEGACY_INPUT_KEY);
    if (legacy) {
      const migrated = rowsFromText(JSON.parse(legacy) as string);
      if (migrated.length > 0) return migrated;
    }
  } catch {
    // 壊れた保存データは捨てて空のグリッドから始める。
  }
  return [createRow()];
}

function init(): State {
  return {
    past: [],
    present: {
      rows: loadRows(),
      selection: singleCell({ row: 0, col: 0 }),
    },
    future: [],
  };
}

export function useGridStore() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const { rows, selection } = state.present;

  // 保存はレンダリングを跨いだ副作用なので effect 側で行う。
  const savedRef = useRef<Row[] | null>(null);
  useEffect(() => {
    if (savedRef.current === rows) return;
    savedRef.current = rows;
    try {
      localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
    } catch {
      // 容量超過などは無視する。
    }
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

export { ROWS_KEY, LEGACY_INPUT_KEY };
