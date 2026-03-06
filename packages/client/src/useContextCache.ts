import { simpleHash } from "./utils";

const CACHE_KEY_PREFIX = "nansuka-context-cache:";

export function getContextCacheKey(text: string): string {
  return CACHE_KEY_PREFIX + simpleHash(text);
}

export function getCachedContext(text: string): string | null {
  try {
    const key = getContextCacheKey(text);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setCachedContext(text: string, context: string): void {
  try {
    const key = getContextCacheKey(text);
    localStorage.setItem(key, context);
  } catch {
    // 保存失敗は無視
  }
}
