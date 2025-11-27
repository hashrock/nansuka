import { isJapanese } from "./utils";

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

export async function translateParagraphs(
  apiKey: string,
  paragraphs: ParagraphInput[]
): Promise<ParagraphResult[]> {
  if (paragraphs.length === 0) return [];

  const paragraphsWithLang = paragraphs.map((p) => ({
    ...p,
    targetLang: isJapanese(p.text) ? "English" : "Japanese",
  }));

  const prompt = paragraphsWithLang
    .map(
      (p, i) =>
        `[${i}] (to ${p.targetLang})\n${p.text}`
    )
    .join("\n\n---\n\n");

  const messages: ClaudeMessage[] = [
    {
      role: "user",
      content: `Translate each paragraph below to the specified language. Output ONLY a JSON array of translations in the same order, like: ["translation1", "translation2", ...]

${prompt}`,
    },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
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
