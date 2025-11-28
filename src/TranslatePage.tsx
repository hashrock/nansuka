import { useState, useEffect, useRef, useCallback } from "react";
import { translateParagraphs, summarizeContext } from "./api";
import { useLocalStorage } from "./useLocalStorage";
import { splitIntoParagraphs, simpleHash } from "./utils";
import {
  getCachedTranslation,
  setCachedTranslation,
} from "./useTranslationCache";

interface AiAction {
  label: string;
  urlTemplate: string;
  promptPrefix?: string;
}

const AI_ACTIONS: AiAction[] = [
  {
    label: "ChatGPTで解説",
    urlTemplate: "https://chatgpt.com/?q=",
    promptPrefix: "以下を解説してください:\n\n",
  },
  {
    label: "ChatGPTでバリエーション",
    urlTemplate: "https://chatgpt.com/?q=",
    promptPrefix: "以下の別の言い方を教えてください:\n\n",
  },
  {
    label: "Claudeで解説",
    urlTemplate: "https://claude.ai/?q=",
    promptPrefix: "以下を解説してください:\n\n",
  },
  {
    label: "Claudeでバリエーション",
    urlTemplate: "https://claude.ai/?q=",
    promptPrefix: "以下の別の言い方を教えてください:\n\n",
  },
];

interface TranslatePageProps {
  onSetting: () => void;
}

interface ParagraphState {
  text: string;
  hash: string;
  translated: string;
  isTranslating: boolean;
}

export function TranslatePage({ onSetting }: TranslatePageProps) {
  const [input, setInput] = useLocalStorage("nansuka-input", "");
  const [paragraphs, setParagraphs] = useState<ParagraphState[]>([]);
  const [context, setContext] = useState("");
  const [error, setError] = useState("");
  const [openDropdownHash, setOpenDropdownHash] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contextRef = useRef(context);
  const translateAbortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // contextRefを常に最新に保つ
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenDropdownHash(null);
      }
    };
    if (openDropdownHash) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdownHash]);

  const translateBatch = useCallback(
    async (toTranslate: { index: number; text: string }[], ctx: string) => {
      if (toTranslate.length === 0) return;

      // 前のリクエストをキャンセル
      if (translateAbortRef.current) {
        translateAbortRef.current.abort();
      }
      translateAbortRef.current = new AbortController();

      // 翻訳中フラグを立てる
      setParagraphs((prev) =>
        prev.map((p, i) =>
          toTranslate.some((t) => t.index === i)
            ? { ...p, isTranslating: true }
            : p,
        ),
      );

      try {
        const results = await translateParagraphs(
          toTranslate,
          ctx,
          translateAbortRef.current.signal,
        );
        setParagraphs((prev) =>
          prev.map((p, i) => {
            const result = results.find((r) => r.index === i);
            if (result) {
              // キャッシュに保存
              setCachedTranslation(p.hash, result.translated);
              return {
                ...p,
                translated: result.translated,
                isTranslating: false,
              };
            }
            return p;
          }),
        );
      } catch (e) {
        // AbortErrorは無視
        if (e instanceof Error && e.name === "AbortError") {
          return;
        }
        setError(e instanceof Error ? e.message : "Translation failed");
        setParagraphs((prev) =>
          prev.map((p) => ({ ...p, isTranslating: false })),
        );
      }
    },
    [],
  );

  // コンテキストの更新（5秒debounce）
  useEffect(() => {
    if (contextDebounceRef.current) {
      clearTimeout(contextDebounceRef.current);
    }

    if (!input.trim()) {
      setContext("");
      return;
    }

    contextDebounceRef.current = setTimeout(async () => {
      try {
        const summary = await summarizeContext(input);
        setContext(summary);
      } catch {
        // コンテキスト取得失敗は無視
      }
    }, 5000);

    return () => {
      if (contextDebounceRef.current) {
        clearTimeout(contextDebounceRef.current);
      }
    };
  }, [input]);

  // 段落の翻訳（1秒debounce）
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setError("");
      const newParagraphs = splitIntoParagraphs(input);

      // 現在の段落を取得
      const prevParagraphs = paragraphs;

      // キャッシュを非同期で取得
      const updated: ParagraphState[] = await Promise.all(
        newParagraphs.map(async (text) => {
          const hash = simpleHash(text);
          const existing = prevParagraphs.find((p) => p.hash === hash);

          if (existing) {
            return existing;
          }

          // キャッシュから翻訳を取得
          const cached = await getCachedTranslation(hash);

          return {
            text,
            hash,
            translated: cached ?? "",
            isTranslating: false,
          };
        }),
      );

      setParagraphs(updated);

      // 翻訳が必要な段落をまとめて取得
      const toTranslate = updated
        .map((p, index) => ({
          index,
          text: p.text,
          needsTranslation: !p.translated && !p.isTranslating && p.text.trim(),
        }))
        .filter((p) => p.needsTranslation)
        .map((p) => ({ index: p.index, text: p.text }));

      if (toTranslate.length > 0) {
        translateBatch(toTranslate, contextRef.current);
      }
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const handleRetranslate = (translated: string) => {
    const newInput = input.trim() + "\n\n" + translated;
    setInput(newInput);
  };

  const getSelectedTextInElement = (element: HTMLElement): string => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";

    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return "";

    return selection.toString().trim();
  };

  const handleAiAction = (
    action: AiAction,
    translated: string,
    textElement: HTMLElement | null,
  ) => {
    const selectedText = textElement
      ? getSelectedTextInElement(textElement)
      : "";
    const textToSend = selectedText || translated;
    const fullPrompt = (action.promptPrefix || "") + textToSend;
    const url = action.urlTemplate + encodeURIComponent(fullPrompt);
    window.open(url, "_blank");
    setOpenDropdownHash(null);
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
        {context && (
          <span className="context-badge" title={context}>
            Context
          </span>
        )}
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
    </div>
  );
}
