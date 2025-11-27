import { useState, useEffect, useRef, useCallback } from "react";
import { translateParagraphs, summarizeContext } from "./api";
import { useLocalStorage } from "./useLocalStorage";
import { splitIntoParagraphs, simpleHash } from "./utils";

interface TranslatePageProps {
  apiKey: string;
  onSetting: () => void;
}

interface ParagraphState {
  text: string;
  hash: string;
  translated: string;
  isTranslating: boolean;
}

export function TranslatePage({ apiKey, onSetting }: TranslatePageProps) {
  const [input, setInput] = useLocalStorage("nansuka-input", "");
  const [paragraphs, setParagraphs] = useState<ParagraphState[]>([]);
  const [context, setContext] = useState("");
  const [error, setError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contextRef = useRef(context);

  // contextRefを常に最新に保つ
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const translateBatch = useCallback(
    async (toTranslate: { index: number; text: string }[], ctx: string) => {
      if (!apiKey || toTranslate.length === 0) return;

      // 翻訳中フラグを立てる
      setParagraphs((prev) =>
        prev.map((p, i) =>
          toTranslate.some((t) => t.index === i)
            ? { ...p, isTranslating: true }
            : p
        )
      );

      try {
        const results = await translateParagraphs(apiKey, toTranslate, ctx);
        setParagraphs((prev) =>
          prev.map((p, i) => {
            const result = results.find((r) => r.index === i);
            if (result) {
              return { ...p, translated: result.translated, isTranslating: false };
            }
            return p;
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Translation failed");
        setParagraphs((prev) =>
          prev.map((p) => ({ ...p, isTranslating: false }))
        );
      }
    },
    [apiKey]
  );

  // コンテキストの更新（5秒debounce）
  useEffect(() => {
    if (contextDebounceRef.current) {
      clearTimeout(contextDebounceRef.current);
    }

    if (!input.trim() || !apiKey) {
      setContext("");
      return;
    }

    contextDebounceRef.current = setTimeout(async () => {
      try {
        const summary = await summarizeContext(apiKey, input);
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
  }, [input, apiKey]);

  // 段落の翻訳（1秒debounce）
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setError("");
      const newParagraphs = splitIntoParagraphs(input);

      setParagraphs((prevParagraphs) => {
        const updated: ParagraphState[] = newParagraphs.map((text) => {
          const hash = simpleHash(text);
          const existing = prevParagraphs.find((p) => p.hash === hash);

          if (existing) {
            return existing;
          }

          return {
            text,
            hash,
            translated: "",
            isTranslating: false,
          };
        });

        // 翻訳が必要な段落をまとめて取得
        const toTranslate = updated
          .map((p, index) => ({ index, text: p.text, needsTranslation: !p.translated && !p.isTranslating && p.text.trim() }))
          .filter((p) => p.needsTranslation)
          .map((p) => ({ index: p.index, text: p.text }));

        if (toTranslate.length > 0) {
          translateBatch(toTranslate, contextRef.current);
        }

        return updated;
      });
    }, 1000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [input, translateBatch]);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const handleRetranslate = (translated: string) => {
    const newInput = input.trim() + "\n\n" + translated;
    setInput(newInput);
  };

  return (
    <div className="translate-page">
      <header>
        <span className="title">Nansuka</span>
        {context && <span className="context-badge" title={context}>Context</span>}
        <button className="setting-button" onClick={onSetting}>
          Settings
        </button>
      </header>
      {!apiKey && (
        <div className="warning">
          API Key is not set. Please configure it in Settings.
        </div>
      )}
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
                  <div className="paragraph-text">{p.translated}</div>
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
