import { isJapanese } from "./utils";
import type { StyleParams } from "./domain/style";

// dev/本番/Web/Electron ともに同一オリジンの Hono API を叩く。
// - Web/本番: Worker が SSR シェルと /translate・/context を同一オリジンで配信
// - dev: @cloudflare/vite-plugin が同一 Worker を localhost:5173 で実行
// - Electron: パッケージ版は本番 Worker URL 全体をロードするため同一オリジン
const BASE_URL = "";

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
  credits?: number;
  cost?: number;
  error?: string;
}

interface TranslateResponse {
  translations: string[];
  credits?: number;
  error?: string;
}

/** クレジット不足は他のエラーと区別して扱えるようにする。 */
export class InsufficientCreditsError extends Error {
  constructor(
    message: string,
    readonly credits: number,
    readonly cost: number,
  ) {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

async function readError(response: Response): Promise<never> {
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    credits?: number;
    cost?: number;
  };
  if (response.status === 402) {
    throw new InsufficientCreditsError(
      data.error || "クレジットが足りません",
      data.credits ?? 0,
      data.cost ?? 0,
    );
  }
  throw new Error(data.error || `API error: ${response.status}`);
}

export interface ContextResult {
  context: string;
  credits?: number;
  cost?: number;
}

export async function summarizeContext(
  text: string,
  noteId?: string,
  signal?: AbortSignal,
): Promise<ContextResult> {
  if (!text.trim()) return { context: "" };

  const response = await fetch(`${BASE_URL}/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, noteId }),
    signal,
  });

  if (!response.ok) await readError(response);

  const data = (await response.json()) as ContextResponse;
  return { context: data.context, credits: data.credits, cost: data.cost };
}

export interface TranslateResult {
  results: ParagraphResult[];
  credits?: number;
}

export interface TranslateOptions {
  context?: string;
  noteId?: string;
  signal?: AbortSignal;
  style?: StyleParams;
  /** ノート固有の指示。null/undefined なら既定の翻訳。 */
  prompt?: string | null;
}

export async function translateParagraphs(
  paragraphs: ParagraphInput[],
  { context, noteId, signal, style, prompt }: TranslateOptions = {},
): Promise<TranslateResult> {
  if (paragraphs.length === 0) return { results: [] };

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
      noteId,
      style,
      prompt: prompt ?? null,
    }),
    signal,
  });

  if (!response.ok) await readError(response);

  const data = (await response.json()) as TranslateResponse;

  return {
    results: paragraphs.map((p, i) => ({
      index: p.index,
      translated: data.translations[i] || "",
    })),
    credits: data.credits,
  };
}
