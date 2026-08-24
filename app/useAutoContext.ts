import { useEffect, useRef } from "react";
import { summarizeContext } from "./api";
import { getCachedContext, setCachedContext } from "./useContextCache";

interface UseAutoContextOptions {
  input: string;
  autoGenerateContext: boolean;
  setContext: (context: string) => void;
  noteId: string;
  onCredits?: (credits: number) => void;
  debounceMs?: number;
}

export function useAutoContext({
  input,
  autoGenerateContext,
  setContext,
  noteId,
  onCredits,
  debounceMs = 5000,
}: UseAutoContextOptions): void {
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onCreditsRef = useRef(onCredits);
  onCreditsRef.current = onCredits;

  useEffect(() => {
    if (contextDebounceRef.current) {
      clearTimeout(contextDebounceRef.current);
    }

    if (!autoGenerateContext) {
      return;
    }

    if (!input.trim()) {
      setContext("");
      return;
    }

    // キャッシュをチェック
    const cached = getCachedContext(input);
    if (cached) {
      setContext(cached);
      return;
    }

    contextDebounceRef.current = setTimeout(async () => {
      try {
        const { context, credits } = await summarizeContext(input, noteId);
        if (typeof credits === "number") onCreditsRef.current?.(credits);
        setContext(context);
        // キャッシュに保存
        setCachedContext(input, context);
      } catch {
        // コンテキストは補助情報なので、失敗しても翻訳の邪魔をしない
      }
    }, debounceMs);

    return () => {
      if (contextDebounceRef.current) {
        clearTimeout(contextDebounceRef.current);
      }
    };
  }, [input, autoGenerateContext, setContext, noteId, debounceMs]);
}
