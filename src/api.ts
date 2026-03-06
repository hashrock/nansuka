import { isJapanese } from "./utils";

const BASE_URL = import.meta.env.DEV ? "/api" : "";

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

interface StreamDelta {
  index: number;
  delta: string;
}

interface StreamDone {
  index: number;
  done: true;
}

interface StreamError {
  error: string;
}

type StreamEvent = StreamDelta | StreamDone | StreamError;

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

export async function translateParagraphsStream(
  paragraphs: ParagraphInput[],
  onDelta: (index: number, text: string) => void,
  onParagraphDone: (index: number) => void,
  context?: string,
  signal?: AbortSignal,
): Promise<void> {
  if (paragraphs.length === 0) return;

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

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSEイベントをパース
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;

      let event: StreamEvent;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      if ("error" in event) {
        throw new Error(event.error);
      }

      if ("done" in event) {
        onParagraphDone(paragraphs[event.index].index);
      } else {
        onDelta(paragraphs[event.index].index, event.delta);
      }
    }
  }
}
