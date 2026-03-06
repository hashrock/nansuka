import { isJapanese } from "./utils";

const isElectron = !!(window as any).electronAPI;
const BASE_URL = isElectron
  ? "https://nansuka.hashrock.workers.dev"
  : import.meta.env.DEV
    ? "/api"
    : "";

export interface ParagraphInput {
  index: number;
  text: string;
}

export interface ParagraphResult {
  index: number;
  translated: string;
}

interface ContextResponse {
  context: string;
  error?: string;
}

interface TranslateResponse {
  translations: string[];
  error?: string;
}

export async function summarizeContext(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!text.trim()) return "";

  const response = await fetch(`${BASE_URL}/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  const data = (await response.json()) as ContextResponse;
  return data.context;
}

export async function translateParagraphs(
  paragraphs: ParagraphInput[],
  context?: string,
  signal?: AbortSignal,
): Promise<ParagraphResult[]> {
  if (paragraphs.length === 0) return [];

  // 段落を配列で一括送信
  const requestParagraphs = paragraphs.map((p) => ({
    text: p.text,
    targetLanguage: isJapanese(p.text) ? "English" : "Japanese",
  }));

  const response = await fetch(`${BASE_URL}/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      paragraphs: requestParagraphs,
      context,
    }),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  const data = (await response.json()) as TranslateResponse;

  return paragraphs.map((p, i) => ({
    index: p.index,
    translated: data.translations[i] || "",
  }));
}
