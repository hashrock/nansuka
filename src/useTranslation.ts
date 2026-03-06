import { useState, useEffect, useRef, useCallback } from "react";
import { translateParagraphsStream } from "./api";
import { splitIntoParagraphs, simpleHash } from "./utils";
import {
  getCachedTranslation,
  setCachedTranslation,
} from "./useTranslationCache";

export interface ParagraphState {
  text: string;
  hash: string;
  translated: string;
  isTranslating: boolean;
}

interface UseTranslationOptions {
  input: string;
  contextRef: React.MutableRefObject<string>;
  debounceMs?: number;
}

interface UseTranslationReturn {
  paragraphs: ParagraphState[];
  error: string;
  setError: (error: string) => void;
}

export function useTranslation({
  input,
  contextRef,
  debounceMs = 1000,
}: UseTranslationOptions): UseTranslationReturn {
  const [paragraphs, setParagraphs] = useState<ParagraphState[]>([]);
  const [error, setError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const translateAbortRef = useRef<AbortController | null>(null);

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
            ? { ...p, isTranslating: true, translated: "" }
            : p,
        ),
      );

      try {
        // ストリーミングでの翻訳テキスト蓄積用
        const accumulated = new Map<number, string>();

        await translateParagraphsStream(
          toTranslate,
          // onDelta: テキストの差分を受け取る
          (index, delta) => {
            const current = (accumulated.get(index) ?? "") + delta;
            accumulated.set(index, current);
            setParagraphs((prev) =>
              prev.map((p, i) =>
                i === index ? { ...p, translated: current } : p,
              ),
            );
          },
          // onParagraphDone: 段落の翻訳完了
          (index) => {
            setParagraphs((prev) => {
              const p = prev[index];
              if (p) {
                const finalText = accumulated.get(index) ?? p.translated;
                setCachedTranslation(p.hash, finalText);
              }
              return prev.map((p, i) =>
                i === index ? { ...p, isTranslating: false } : p,
              );
            });
          },
          ctx,
          translateAbortRef.current.signal,
        );

        // 全段落完了
        setParagraphs((prev) =>
          prev.map((p) => ({ ...p, isTranslating: false })),
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

  // 段落の翻訳（debounce）
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
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  return { paragraphs, error, setError };
}
