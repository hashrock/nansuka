import { isJapanese } from "./utils";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: { type: "text"; text: string }[];
}

export async function translate(apiKey: string, text: string): Promise<string> {
  const toJapanese = !isJapanese(text);
  const targetLang = toJapanese ? "Japanese" : "English";

  const messages: ClaudeMessage[] = [
    {
      role: "user",
      content: `Translate the following text to ${targetLang}. Only output the translation, nothing else.\n\n${text}`,
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
  return data.content[0].text;
}

export async function retranslate(
  apiKey: string,
  original: string,
  translated: string,
): Promise<string> {
  const toJapanese = isJapanese(translated);
  const targetLang = toJapanese ? "Japanese" : "English";

  const messages: ClaudeMessage[] = [
    {
      role: "user",
      content: `Here is the original text:\n${original}\n\nHere is a translation:\n${translated}\n\nPlease provide an alternative translation to ${targetLang} that conveys the same meaning but uses different phrasing. Only output the translation, nothing else.`,
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
  return data.content[0].text;
}
