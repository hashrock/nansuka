import { useState, useEffect, useRef, useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { useTranslation } from "./useTranslation";
import { useAutoContext } from "./useAutoContext";
import { useDropdownOutsideClick } from "./useDropdownOutsideClick";
import { AI_ACTIONS, handleAiAction } from "./aiActions";
import { useToast, ToastContainer } from "./Toast";

interface TranslatePageProps {
  onSetting: () => void;
}

export function TranslatePage({ onSetting }: TranslatePageProps) {
  const [input, setInput] = useLocalStorage("nansuka-input", "");
  const [context, setContext] = useLocalStorage("nansuka-context", "");
  const [autoGenerateContext, setAutoGenerateContext] = useLocalStorage(
    "nansuka-auto-context",
    true,
  );
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [openDropdownHash, setOpenDropdownHash] = useState<string | null>(null);

  const contextRef = useRef(context);

  // contextRefを常に最新に保つ
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // カスタムフックを使用
  const { paragraphs, error } = useTranslation({
    input,
    contextRef,
  });

  useAutoContext({
    input,
    autoGenerateContext,
    setContext,
  });

  const closeDropdown = useCallback(() => {
    setOpenDropdownHash(null);
  }, []);

  const { toasts, showToast } = useToast();

  const { dropdownRef } = useDropdownOutsideClick({
    isOpen: openDropdownHash !== null,
    onClose: closeDropdown,
  });

  // コンテキストモーダルを開く
  const openContextModal = () => {
    setContextDraft(context);
    setIsContextModalOpen(true);
  };

  // コンテキストを手書きで保存（自動生成をオフにする）
  const handleContextSave = () => {
    if (contextDraft !== context) {
      setAutoGenerateContext(false);
    }
    setContext(contextDraft);
    setIsContextModalOpen(false);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    showToast("Copied!");
  };

  const handleRetranslate = (translated: string) => {
    const newInput = input.trim() + "\n\n" + translated;
    setInput(newInput);
  };

  return (
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
        <button className="setting-button" onClick={onSetting}>
          Settings
        </button>
      </header>

      {error && <div className="error">{error}</div>}
      <div className="columns">
        <textarea
          className="column"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to translate..."
        />
        <div className="column translation-list">
          {paragraphs.length === 0 && (
            <p className="placeholder">Translation will appear here...</p>
          )}
          {paragraphs.map((p) => (
            <div key={p.hash} className="paragraph-item">
              {p.isTranslating ? (
                <span className="translating">Translating...</span>
              ) : (
                <>
                  <div className="paragraph-text" data-hash={p.hash}>
                    {p.translated}
                  </div>
                  <div className="paragraph-actions">
                    <button
                      className="action-btn"
                      onClick={() => handleCopy(p.translated)}
                      title="Copy"
                    >
                      Copy
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleRetranslate(p.translated)}
                      title="Retranslate"
                    >
                      Retranslate
                    </button>
                    <div
                      className="dropdown-container"
                      ref={openDropdownHash === p.hash ? dropdownRef : null}
                    >
                      <button
                        className="action-btn"
                        onClick={() =>
                          setOpenDropdownHash(
                            openDropdownHash === p.hash ? null : p.hash,
                          )
                        }
                        title="AIで開く"
                      >
                        AI ▼
                      </button>
                      {openDropdownHash === p.hash && (
                        <div className="dropdown-menu">
                          {AI_ACTIONS.map((action) => (
                            <button
                              key={action.label}
                              className="dropdown-item"
                              onClick={() => {
                                const textEl = document.querySelector(
                                  `[data-hash="${p.hash}"]`,
                                ) as HTMLElement | null;
                                handleAiAction(action, p.translated, textEl);
                                setOpenDropdownHash(null);
                              }}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

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
  );
}
