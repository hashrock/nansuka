import { isJapanese } from "./utils";

const PROXY_URL = import.meta.env.DEV
  ? "/api/anthropic"
  : "https://nansuka-proxy.hashrock.workers.dev";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: { type: "text"; text: string }[];
}

export interface ParagraphInput {
  index: number;
  text: string;
}

export interface ParagraphResult {
  index: number;
  translated: string;
}

export async function summarizeContext(text: string): Promise<string> {
  if (!text.trim()) return "";

  const messages: ClaudeMessage[] = [
    {
      role: "user",
      content: `Summarize the following text in one sentence (in English). This will be used as context for translation. Output ONLY the summary, nothing else.

${text}`,
    },
  ];

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = (await response.json()) as ClaudeResponse;
  return data.content[0].text.trim();
}

export async function translateParagraphs(
  paragraphs: ParagraphInput[],
  context?: string,
): Promise<ParagraphResult[]> {
  if (paragraphs.length === 0) return [];

  const paragraphsWithLang = paragraphs.map((p) => ({
    ...p,
    targetLang: isJapanese(p.text) ? "English" : "Japanese",
  }));

  const prompt = paragraphsWithLang
    .map((p, i) => `[${i}] (to ${p.targetLang})\n${p.text}`)
    .join("\n\n---\n\n");

  const contextInfo = context ? `Context: ${context}\n\n` : "";

  const messages: ClaudeMessage[] = [
    {
      role: "user",
      content: `${contextInfo}Translate each paragraph below to the specified language. Output ONLY a JSON array of translations in the same order, like: ["translation1", "translation2", ...]

${prompt}`,
    },
  ];

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = (await response.json()) as ClaudeResponse;
  let text = data.content[0].text.trim();

  // コードブロックを除去
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const translations = JSON.parse(text) as string[];

  return paragraphs.map((p, i) => ({
    index: p.index,
    translated: translations[i] || "",
  }));
}
