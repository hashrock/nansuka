import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  COL_COUNT,
  COL_SOURCE,
  COL_TRANSLATED,
  getCell,
  type CellRef,
  type Row,
  type Selection,
} from "./types";
import {
  clampSelection,
  moveCell,
  moveCellWrapping,
  rectContains,
  selectAll,
  selectRow,
  singleCell,
  toRect,
} from "./selection";
import {
  clearCells,
  deleteRows,
  extractGrid,
  insertRows,
  moveRows,
  pasteGrid,
  setCell,
} from "./operations";
import { padGrid, parseTsv, serializeTsv } from "./tsv";
import { AI_ACTIONS, handleAiAction } from "../aiActions";

const COLUMN_LABELS = ["原文", "訳文"];

interface MenuState {
  x: number;
  y: number;
  cell: CellRef;
}

interface GridProps {
  rows: Row[];
  selection: Selection;
  translatingIds: ReadonlySet<string>;
  onCommit: (rows: Row[], selection?: Selection) => void;
  onSelect: (selection: Selection) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetranslate: (ids: string[]) => void;
  onToast: (message: string) => void;
}

export function Grid({
  rows,
  selection,
  translatingIds,
  onCommit,
  onSelect,
  onUndo,
  onRedo,
  onRetranslate,
  onToast,
}: GridProps) {
  /**
   * 入力はフォーカス中のセルに常設した textarea が受ける。
   *
   * 未編集のときは透明な待機状態で、文字が入った時点 (IME なら
   * compositionstart) で編集モードに切り替える。キー入力を JS 側で横取りして
   * 初期値に流し込む方式だと IME の変換前の生キーを掴んでしまい、「n本語だよ」
   * のように1文字目だけ英字で残る。同じ要素のまま見た目だけ変えることで、
   * 変換を中断せずに編集へ移行できる。
   */
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const focusedCellRef = useRef<HTMLTableCellElement>(null);
  // 確定はフォーカス移動を伴い、その blur がもう一度 onBlur を呼ぶ。
  // state 更新は同期の blur に間に合わないので、確定済みかは ref で判定する。
  const editingRef = useRef(false);
  const dragSelectingRef = useRef(false);
  const dragRowsRef = useRef<{ from: number; count: number } | null>(null);

  const rect = toRect(selection);
  const focus = selection.focus;
  const focusedRow = rows[focus.row];
  const focusedValue = focusedRow ? getCell(focusedRow, focus.col) : "";

  // --- フォーカス管理 -------------------------------------------------

  const focusEditor = useCallback(() => {
    editorRef.current?.focus({ preventScroll: true });
  }, []);

  // セルを移動したら待機用 textarea を空に戻して、その位置へ連れていく。
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!editingRef.current) {
      el.value = "";
      el.style.height = "";
    }
    el.focus({ preventScroll: true });
    focusedCellRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus.row, focus.col]);

  // ドラッグ選択はグリッドの外で指を離しても終わる必要がある。
  useEffect(() => {
    const stop = () => {
      dragSelectingRef.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // --- 編集 -----------------------------------------------------------

  /** Enter / F2 / ダブルクリックのように、既存の値から編集を始める。 */
  const beginEdit = useCallback(() => {
    const el = editorRef.current;
    if (!el || editingRef.current) return;
    editingRef.current = true;
    setEditing(true);
    el.value = focusedValue;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    autoSize(el);
  }, [focusedValue]);

  /** 文字が入ってきたので編集モードに入る。値は textarea 側に既にある。 */
  const beginTyping = useCallback(() => {
    if (editingRef.current) return;
    editingRef.current = true;
    setEditing(true);
    if (editorRef.current) autoSize(editorRef.current);
  }, []);

  /** 編集を確定する。appendRow を指定すると末尾に空行を足してそこへ移る。 */
  const finishEdit = useCallback(
    (options?: { focus?: CellRef; appendRow?: boolean }) => {
      if (!editingRef.current) return;
      const el = editorRef.current;
      const value = el ? el.value : "";

      editingRef.current = false;
      setEditing(false);
      if (el) {
        el.value = "";
        el.style.height = "";
      }

      let next = setCell(rows, focus.row, focus.col, value);
      let target = options?.focus;
      if (options?.appendRow) {
        next = insertRows(next, next.length, 1);
        target = { row: next.length - 1, col: focus.col };
      }

      onCommit(
        next,
        target ? clampSelection(singleCell(target), next.length) : undefined,
      );
      focusEditor();
    },
    [rows, focus.row, focus.col, onCommit, focusEditor],
  );

  const cancelEdit = useCallback(() => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const el = editorRef.current;
    if (el) {
      el.value = "";
      el.style.height = "";
      el.focus({ preventScroll: true });
    }
  }, []);

  // --- 選択 -----------------------------------------------------------

  const moveTo = useCallback(
    (cell: CellRef, extend: boolean) => {
      onSelect(extend ? { anchor: selection.anchor, focus: cell } : singleCell(cell));
    },
    [onSelect, selection.anchor],
  );

  // --- クリップボード -------------------------------------------------

  const copySelection = useCallback(
    (event: React.ClipboardEvent) => {
      // 編集中は textarea の中身のコピーなので既定の動作に任せる。
      if (editingRef.current) return;
      // セル内の文字列を選んでいるときも同じ。
      const domSelection = window.getSelection();
      if (domSelection && !domSelection.isCollapsed) return;

      event.preventDefault();
      event.clipboardData.setData("text/plain", serializeTsv(extractGrid(rows, rect)));
      onToast("Copied!");
    },
    [rows, rect, onToast],
  );

  const handleCut = useCallback(
    (event: React.ClipboardEvent) => {
      if (editingRef.current) return;
      const domSelection = window.getSelection();
      if (domSelection && !domSelection.isCollapsed) return;

      event.preventDefault();
      event.clipboardData.setData("text/plain", serializeTsv(extractGrid(rows, rect)));
      onCommit(clearCells(rows, rect));
      onToast("Cut");
    },
    [rows, rect, onCommit, onToast],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      // 編集中はセルの中身への貼り付け。グリッドへの流し込みではない。
      if (editingRef.current) return;

      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      if (!text) return;

      const grid = padGrid(parseTsv(text), COL_COUNT - rect.left);
      if (grid.length === 0) return;

      const next = pasteGrid(rows, rect.top, rect.left, grid);
      onCommit(next, {
        anchor: { row: rect.top, col: rect.left },
        focus: {
          row: rect.top + grid.length - 1,
          col: Math.min(rect.left + grid[0].length - 1, COL_COUNT - 1),
        },
      });
    },
    [rows, rect, onCommit],
  );

  // --- キーボード -----------------------------------------------------

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // IME 変換中のキーは一切横取りしない。keyCode 229 は変換開始時の保険。
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;

      if (editingRef.current) {
        // Alt / Shift + Enter は改行。長い段落もセルに収められるようにする。
        if (event.key === "Enter" && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          // 末尾で確定したら次の行を用意して、そのまま入力を続けられるようにする。
          if (focus.row >= rows.length - 1) finishEdit({ appendRow: true });
          else finishEdit({ focus: { row: focus.row + 1, col: focus.col } });
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          finishEdit({
            focus: moveCellWrapping(focus, event.shiftKey ? -1 : 1, rows.length),
          });
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelEdit();
        }
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (mod && key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && key.toLowerCase() === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (mod && key.toLowerCase() === "a") {
        event.preventDefault();
        onSelect(selectAll(rows.length));
        return;
      }
      // その他の修飾キー付きはブラウザに任せる (コピー等は clipboard 側で処理)。
      if (mod) return;

      switch (key) {
        case "ArrowUp":
          event.preventDefault();
          moveTo(moveCell(focus, -1, 0, rows.length), event.shiftKey);
          return;
        case "ArrowDown":
          event.preventDefault();
          moveTo(moveCell(focus, 1, 0, rows.length), event.shiftKey);
          return;
        case "ArrowLeft":
          event.preventDefault();
          moveTo(moveCell(focus, 0, -1, rows.length), event.shiftKey);
          return;
        case "ArrowRight":
          event.preventDefault();
          moveTo(moveCell(focus, 0, 1, rows.length), event.shiftKey);
          return;
        case "Tab":
          event.preventDefault();
          moveTo(moveCellWrapping(focus, event.shiftKey ? -1 : 1, rows.length), false);
          return;
        case "Home":
          event.preventDefault();
          moveTo({ row: focus.row, col: 0 }, event.shiftKey);
          return;
        case "End":
          event.preventDefault();
          moveTo({ row: focus.row, col: COL_COUNT - 1 }, event.shiftKey);
          return;
        case "Enter":
        case "F2":
          event.preventDefault();
          beginEdit();
          return;
        case "Escape":
          event.preventDefault();
          onSelect(singleCell(focus));
          return;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          onCommit(clearCells(rows, rect));
          return;
      }

      // 印字可能なキーは preventDefault しない。待機中の textarea にそのまま
      // 入り、onInput が編集モードへ切り替える (Excel と同じ上書き入力)。
    },
    [
      focus,
      rect,
      rows,
      moveTo,
      beginEdit,
      finishEdit,
      cancelEdit,
      onCommit,
      onSelect,
      onUndo,
      onRedo,
    ],
  );

  // --- 行操作 ---------------------------------------------------------

  const insertAt = useCallback(
    (index: number) => {
      const next = insertRows(rows, index, 1);
      onCommit(next, singleCell({ row: index, col: COL_SOURCE }));
    },
    [rows, onCommit],
  );

  const removeRows = useCallback(() => {
    const next = deleteRows(rows, rect.top, rect.bottom);
    onCommit(
      next,
      clampSelection(singleCell({ row: rect.top, col: focus.col }), next.length),
    );
  }, [rows, rect, focus.col, onCommit]);

  const handleRowDrop = useCallback(
    (target: number) => {
      const drag = dragRowsRef.current;
      dragRowsRef.current = null;
      setDropTarget(null);
      if (!drag) return;

      const next = moveRows(rows, drag.from, drag.count, target);
      if (next === rows) return;
      const landedAt = target > drag.from ? target - drag.count : target;
      onCommit(next, {
        anchor: { row: landedAt, col: 0 },
        focus: { row: landedAt + drag.count - 1, col: COL_COUNT - 1 },
      });
    },
    [rows, onCommit],
  );

  // --- コンテキストメニュー -------------------------------------------

  const openMenu = useCallback(
    (event: React.MouseEvent, cell: CellRef) => {
      event.preventDefault();
      if (!rectContains(rect, cell.row, cell.col)) onSelect(singleCell(cell));
      setMenu({ x: event.clientX, y: event.clientY, cell });
    },
    [rect, onSelect],
  );

  const selectedIds = rows.slice(rect.top, rect.bottom + 1).map((row) => row.id);

  return (
    <div
      className="grid-container"
      onKeyDown={handleKeyDown}
      onCopy={copySelection}
      onCut={handleCut}
      onPaste={handlePaste}
    >
      <table className="grid">
        <colgroup>
          <col className="grid-col-num" />
          <col className="grid-col-cell" />
          <col className="grid-col-cell" />
        </colgroup>
        <thead>
          <tr>
            <th className="grid-corner" scope="col">
              <span className="sr-only">行</span>
            </th>
            {COLUMN_LABELS.map((label, col) => (
              <th
                key={label}
                scope="col"
                className={
                  rect.left <= col && col <= rect.right ? "is-active" : undefined
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const rowSelected = r >= rect.top && r <= rect.bottom;
            return (
              <tr
                key={row.id}
                className={[
                  rowSelected ? "is-selected" : "",
                  dropTarget === r ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(e) => {
                  if (!dragRowsRef.current) return;
                  e.preventDefault();
                  setDropTarget(r);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleRowDrop(r);
                }}
              >
                <th
                  scope="row"
                  className="grid-row-head"
                  draggable
                  onDragStart={() => {
                    dragRowsRef.current = rowSelected
                      ? { from: rect.top, count: rect.bottom - rect.top + 1 }
                      : { from: r, count: 1 };
                    if (!rowSelected) onSelect(selectRow(r));
                  }}
                  onDragEnd={() => {
                    dragRowsRef.current = null;
                    setDropTarget(null);
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    finishEdit();
                    onSelect(
                      e.shiftKey
                        ? {
                            anchor: selection.anchor,
                            focus: { row: r, col: COL_COUNT - 1 },
                          }
                        : selectRow(r),
                    );
                  }}
                  onContextMenu={(e) => openMenu(e, { row: r, col: COL_SOURCE })}
                >
                  {r + 1}
                </th>

                {[COL_SOURCE, COL_TRANSLATED].map((col) => {
                  const isFocused = focus.row === r && focus.col === col;
                  const isEditing = isFocused && editing;
                  const isTranslating =
                    col === COL_TRANSLATED && translatingIds.has(row.id);
                  const value = getCell(row, col);

                  return (
                    <td
                      key={col}
                      ref={isFocused ? focusedCellRef : undefined}
                      data-row-id={row.id}
                      className={[
                        "grid-cell",
                        rectContains(rect, r, col) ? "is-selected" : "",
                        isFocused ? "is-focused" : "",
                        col === COL_TRANSLATED && row.overridden ? "is-overridden" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseDown={(e) => {
                        if (e.button === 2 || isEditing) return;
                        finishEdit();
                        dragSelectingRef.current = true;
                        moveTo({ row: r, col }, e.shiftKey);
                      }}
                      onMouseEnter={() => {
                        if (!dragSelectingRef.current) return;
                        onSelect({ anchor: selection.anchor, focus: { row: r, col } });
                      }}
                      onDoubleClick={() => {
                        if (isFocused) beginEdit();
                      }}
                      onContextMenu={(e) => openMenu(e, { row: r, col })}
                    >
                      <span
                        className={isTranslating ? "grid-translating" : "grid-value"}
                        hidden={isEditing}
                      >
                        {isTranslating ? "Translating…" : value}
                      </span>
                      {/* フォーカス中のセルにだけ常設する入力受け。編集開始時も
                          同じ要素のまま見た目を変えるので IME が途切れない。 */}
                      {isFocused && (
                        <textarea
                          ref={editorRef}
                          className={isEditing ? "grid-editor" : "grid-capture"}
                          rows={1}
                          spellCheck={false}
                          aria-label={COLUMN_LABELS[col]}
                          onCompositionStart={beginTyping}
                          onInput={(e) => {
                            beginTyping();
                            autoSize(e.currentTarget);
                          }}
                          onBlur={() => finishEdit()}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {menu && (
        <ContextMenu
          menu={menu}
          rows={rows}
          onClose={() => setMenu(null)}
          onInsertAbove={() => insertAt(rect.top)}
          onInsertBelow={() => insertAt(rect.bottom + 1)}
          onDelete={removeRows}
          onRetranslate={() => onRetranslate(selectedIds)}
          onCopy={async () => {
            await navigator.clipboard.writeText(serializeTsv(extractGrid(rows, rect)));
            onToast("Copied!");
          }}
        />
      )}
    </div>
  );
}

interface ContextMenuProps {
  menu: MenuState;
  rows: Row[];
  onClose: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
  onRetranslate: () => void;
  onCopy: () => void;
}

function ContextMenu({
  menu,
  rows,
  onClose,
  onInsertAbove,
  onInsertBelow,
  onDelete,
  onRetranslate,
  onCopy,
}: ContextMenuProps) {
  const row = rows[menu.cell.row];
  const canAskAi = Boolean(row?.translated);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <div
      className="grid-menu"
      style={{ top: menu.y, left: menu.x }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className="grid-menu-item" onClick={run(onCopy)}>
        コピー
      </button>
      <div className="grid-menu-sep" />
      <button className="grid-menu-item" onClick={run(onInsertAbove)}>
        上に行を挿入
      </button>
      <button className="grid-menu-item" onClick={run(onInsertBelow)}>
        下に行を挿入
      </button>
      <button className="grid-menu-item" onClick={run(onDelete)}>
        行を削除
      </button>
      <div className="grid-menu-sep" />
      <button className="grid-menu-item" onClick={run(onRetranslate)}>
        再翻訳
      </button>
      {canAskAi && (
        <>
          <div className="grid-menu-sep" />
          {AI_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="grid-menu-item"
              onClick={run(() => {
                const el = document.querySelector(
                  `[data-row-id="${row.id}"].grid-cell`,
                ) as HTMLElement | null;
                handleAiAction(action, row.translated, el);
              })}
            >
              {action.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/** 段落がそのまま入るよう、入力に合わせて編集欄の高さを伸ばす。 */
function autoSize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
