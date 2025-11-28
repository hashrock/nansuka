import { useEffect, useRef } from "react";
import { summarizeContext } from "./api";
import { getCachedContext, setCachedContext } from "./useContextCache";

interface UseAutoContextOptions {
  input: string;
  autoGenerateContext: boolean;
  setContext: (context: string) => void;
  debounceMs?: number;
}

export function useAutoContext({
  input,
  autoGenerateContext,
  setContext,
  debounceMs = 5000,
}: UseAutoContextOptions): void {
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
        const summary = await summarizeContext(input);
        setContext(summary);
        // キャッシュに保存
        setCachedContext(input, summary);
      } catch {
        // コンテキスト取得失敗は無視
      }
    }, debounceMs);

    return () => {
      if (contextDebounceRef.current) {
        clearTimeout(contextDebounceRef.current);
      }
    };
  }, [input, autoGenerateContext, setContext, debounceMs]);
}
