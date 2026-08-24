import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "../useLocalStorage";
import { useAutoContext } from "../useAutoContext";
import { useToast, ToastContainer } from "../Toast";
import { Grid } from "../grid/Grid";
import { useGridStore } from "../grid/useGridStore";
import { insertRows } from "../grid/operations";
import { singleCell, toRect } from "../grid/selection";
import { COL_SOURCE } from "../grid/types";
import { useRowTranslation } from "../useRowTranslation";
import "../App.css";

export default function Translate() {
  const [showSettings, setShowSettings] = useState(false);
  const [context, setContext] = useLocalStorage("nansuka-context", "");
  const [autoGenerateContext, setAutoGenerateContext] = useLocalStorage(
    "nansuka-auto-context",
    true,
  );
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");

  const {
    rows,
    selection,
    canUndo,
    canRedo,
    commit,
    select,
    patch,
    undo,
    redo,
  } = useGridStore();

  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // コンテキスト要約は原文カラム全体を1つの文書として扱う。
  const sourceText = useMemo(
    () =>
      rows
        .map((row) => row.source.trim())
        .filter(Boolean)
        .join("\n\n"),
    [rows],
  );

  const { error, translatingIds, retranslate } = useRowTranslation({
    rows,
    patch,
    contextRef,
  });

  useAutoContext({
    input: sourceText,
    autoGenerateContext,
    setContext,
  });

  const { toasts, showToast } = useToast();

  const openContextModal = () => {
    setContextDraft(context);
    setIsContextModalOpen(true);
  };

  // 手書きしたコンテキストを自動生成で上書きしないよう、保存時に自動生成を切る。
  const handleContextSave = () => {
    if (contextDraft !== context) {
      setAutoGenerateContext(false);
    }
    setContext(contextDraft);
    setIsContextModalOpen(false);
  };

  const addRow = () => {
    const next = insertRows(rows, rows.length, 1);
    commit(next, singleCell({ row: next.length - 1, col: COL_SOURCE }));
  };

  const retranslateSelection = () => {
    const rect = toRect(selection);
    retranslate(rows.slice(rect.top, rect.bottom + 1).map((row) => row.id));
  };

  return (
    <>
      <div className="translate-page">
        <header>
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt="Nansuka"
            className="logo"
          />
          <span className="title">Nansuka</span>
          <button
            className="context-badge"
            onClick={openContextModal}
            title={context || "Click to set context"}
          >
            {context
              ? context.split(/\s+/).slice(0, 5).join(" ") + "..."
              : "Context"}
          </button>
          <button
            className="setting-button"
            onClick={() => setShowSettings(true)}
          >
            Settings
          </button>
        </header>

        {/* ボタンにフォーカスを移さない。グリッドの入力欄がフォーカスを
            持ったままなので、押した直後にそのままタイプを続けられる。 */}
        <div className="toolbar" onMouseDown={(e) => e.preventDefault()}>
          <button className="tool-btn" onClick={addRow}>
            行を追加
          </button>
          <button className="tool-btn" onClick={retranslateSelection}>
            再翻訳
          </button>
          <span className="toolbar-sep" />
          <button className="tool-btn" onClick={undo} disabled={!canUndo}>
            元に戻す
          </button>
          <button className="tool-btn" onClick={redo} disabled={!canRedo}>
            やり直す
          </button>
          <span className="toolbar-hint">
            Enter/F2 で編集・Tab で移動・Excel と貼り付け互換
          </span>
        </div>

        {error && <div className="error">{error}</div>}

        <Grid
          rows={rows}
          selection={selection}
          translatingIds={translatingIds}
          onCommit={commit}
          onSelect={select}
          onUndo={undo}
          onRedo={redo}
          onRetranslate={retranslate}
          onToast={showToast}
        />

        {isContextModalOpen && (
          <div
            className="modal-overlay"
            onClick={() => setIsContextModalOpen(false)}
          >
            <div
              className="modal context-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Context</h2>
                <button
                  className="close-btn"
                  onClick={() => setIsContextModalOpen(false)}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={autoGenerateContext}
                    onChange={(e) => setAutoGenerateContext(e.target.checked)}
                  />
                  Auto-generate context from input
                </label>
                <textarea
                  className="context-textarea"
                  value={contextDraft}
                  onChange={(e) => {
                    setContextDraft(e.target.value);
                    if (autoGenerateContext) {
                      setAutoGenerateContext(false);
                    }
                  }}
                  placeholder="Enter context to help with translation..."
                  rows={4}
                />
                <div className="modal-actions">
                  <button className="save-btn" onClick={handleContextSave}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ToastContainer toasts={toasts} />
      </div>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button
                className="close-btn"
                onClick={() => setShowSettings(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <a
                href="https://github.com/hashrock/nansuka"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
