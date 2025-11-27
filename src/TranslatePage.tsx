import { useState, useEffect, useRef, useCallback } from "react";
import { translate, retranslate } from "./api";

interface TranslatePageProps {
  apiKey: string;
  onSetting: () => void;
}

export function TranslatePage({ apiKey, onSetting }: TranslatePageProps) {
  const [input, setInput] = useState("");
  const [translated, setTranslated] = useState("");
  const [retranslated, setRetranslated] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [error, setError] = useState("");

  const translateTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retranslateTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doTranslate = useCallback(
    async (text: string) => {
      if (!text.trim() || !apiKey) return;
      setIsTranslating(true);
      setError("");
      try {
        const result = await translate(apiKey, text);
        setTranslated(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Translation failed");
      } finally {
        setIsTranslating(false);
      }
    },
    [apiKey]
  );

  const doRetranslate = useCallback(
    async (original: string, translatedText: string) => {
      if (!original.trim() || !translatedText.trim() || !apiKey) return;
      setIsRetranslating(true);
      try {
        const result = await retranslate(apiKey, original, translatedText);
        setRetranslated(result);
      } catch {
        // ignore retranslate errors silently
      } finally {
        setIsRetranslating(false);
      }
    },
    [apiKey]
  );

  useEffect(() => {
    setTranslated("");
    setRetranslated("");
    setError("");

    if (translateTimeoutRef.current) {
      clearTimeout(translateTimeoutRef.current);
    }
    if (retranslateTimeoutRef.current) {
      clearTimeout(retranslateTimeoutRef.current);
    }

    if (!input.trim()) return;

    // 1秒debounceで翻訳
    translateTimeoutRef.current = setTimeout(() => {
      doTranslate(input);
    }, 1000);

    return () => {
      if (translateTimeoutRef.current) {
        clearTimeout(translateTimeoutRef.current);
      }
    };
  }, [input, doTranslate]);

  useEffect(() => {
    setRetranslated("");

    if (retranslateTimeoutRef.current) {
      clearTimeout(retranslateTimeoutRef.current);
    }

    if (!translated.trim() || !input.trim()) return;

    // 5秒debounceで訳し直し
    retranslateTimeoutRef.current = setTimeout(() => {
      doRetranslate(input, translated);
    }, 5000);

    return () => {
      if (retranslateTimeoutRef.current) {
        clearTimeout(retranslateTimeoutRef.current);
      }
    };
  }, [translated, input, doRetranslate]);

  return (
    <div className="translate-page">
      <header>
        <span className="title">Nansuka</span>
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
        <textarea
          className="column"
          value={isTranslating ? "Translating..." : translated}
          readOnly
          placeholder="Translation will appear here..."
        />
        <textarea
          className="column"
          value={isRetranslating ? "Retranslating..." : retranslated}
          readOnly
          placeholder="Alternative translation..."
        />
      </div>
    </div>
  );
}
