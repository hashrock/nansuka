// 日本語が含まれているかを判定
export function isJapanese(text: string): boolean {
  // ひらがな、カタカナ、漢字の範囲をチェック
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  return japaneseRegex.test(text);
}

// 段落ごとに分割
export function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

// debounce関数
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
