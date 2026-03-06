import { MODEL } from "./config";

// リクエスト/レスポンスの型定義
export interface TranslateParagraph {
  text: string;
  targetLanguage: string;
}

export interface TranslateRequest {
  paragraphs: TranslateParagraph[];
  context?: string;
}

export interface ContextRequest {
  text: string;
}

// システムプロンプト
const TRANSLATE_SYSTEM_PROMPT = `You are a professional translator.
Translate each paragraph to the specified target language.
Output ONLY the translations, one per paragraph.
When there are multiple paragraphs, separate each translation with a line containing only "---".
Do not include any other text, explanations, or labels.`;

const CONTEXT_SYSTEM_PROMPT = `Summarize the given text in one short sentence (max 20 words).
This summary will be used as context for translation.
Output ONLY the summary sentence, nothing else.`;

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
}

async function* readAnthropicStream(
  response: Response,
): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSEイベントをパース（\n\nで区切り）
    while (true) {
      const eventEnd = buffer.indexOf("\n\n");
      if (eventEnd === -1) break;

      const eventStr = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);

      for (const line of eventStr.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6);
        if (dataStr === "[DONE]") return;

        let event: AnthropicStreamEvent;
        try {
          event = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          event.delta.text
        ) {
          yield event.delta.text;
        }
      }
    }
  }
}

export async function* translateStream(
  baseURL: string,
  apiKey: string,
  req: TranslateRequest,
): AsyncGenerator<
  { index: number; delta: string } | { index: number; done: true }
> {
  const formattedParagraphs = req.paragraphs
    .map((p, i) => `[${i}] (to ${p.targetLanguage})\n${p.text}`)
    .join("\n\n---\n\n");

  const contextInfo = req.context ? `Context: ${req.context}\n\n` : "";
  const userMessage = `${contextInfo}Translate each paragraph below:\n\n${formattedParagraphs}`;

  const response = await fetch(`${baseURL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      stream: true,
      system: TRANSLATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  let currentIndex = 0;
  let buffer = "";

  for await (const text of readAnthropicStream(response)) {
    buffer += text;

    // デリミタ "---" で段落を区切る
    while (buffer.includes("\n---\n")) {
      const delimiterPos = buffer.indexOf("\n---\n");
      const before = buffer.slice(0, delimiterPos);
      if (before) {
        yield { index: currentIndex, delta: before };
      }
      yield { index: currentIndex, done: true };
      currentIndex++;
      buffer = buffer.slice(delimiterPos + 5);
    }

    // バッファに残っているテキストを送信
    if (buffer) {
      yield { index: currentIndex, delta: buffer };
      buffer = "";
    }
  }

  // 最後の段落を完了
  yield { index: currentIndex, done: true };
}

export async function summarizeContext(
  baseURL: string,
  apiKey: string,
  text: string,
): Promise<string> {
  const response = await fetch(`${baseURL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 100,
      system: CONTEXT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Summarize this text:\n\n${text}` },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const data = await response.json<{
    content: { type: string; text: string }[];
  }>();
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Failed to get context response");
  }
  return textBlock.text.trim();
}
