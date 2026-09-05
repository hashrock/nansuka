import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Row, Selection } from "./types";
import { singleCell } from "./selection";
import { canRedo, canUndo, historyReducer, initHistory } from "./history";

interface Options {
  initialRows: Row[];
  /**
   * 行が変わるたびに呼ばれる。保存先 (ノートのオートセーブなど) は
   * 呼び出し側の関心事なので、ここでは持たない。
   */
  onPersist?: (rows: Row[]) => void;
}

export function useGridStore({ initialRows, onPersist }: Options) {
  const [state, dispatch] = useReducer(historyReducer, initialRows, (rows) =>
    initHistory({ rows, selection: singleCell({ row: 0, col: 0 }) }),
  );
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

  const undoable = canUndo(state);
  const redoable = canRedo(state);

  return useMemo(
    () => ({
      rows,
      selection,
      canUndo: undoable,
      canRedo: redoable,
      commit,
      select,
      patch,
      undo,
      redo,
    }),
    [
      rows,
      selection,
      undoable,
      redoable,
      commit,
      select,
      patch,
      undo,
      redo,
    ],
  );
}
