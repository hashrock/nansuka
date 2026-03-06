import Anthropic from "@anthropic-ai/sdk";
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

export async function* translateStream(
  client: Anthropic,
  req: TranslateRequest,
): AsyncGenerator<{ index: number; delta: string } | { index: number; done: true }> {
  const formattedParagraphs = req.paragraphs
    .map((p, i) => `[${i}] (to ${p.targetLanguage})\n${p.text}`)
    .join("\n\n---\n\n");

  const contextInfo = req.context ? `Context: ${req.context}\n\n` : "";
  const userMessage = `${contextInfo}Translate each paragraph below:\n\n${formattedParagraphs}`;

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: TRANSLATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  let currentIndex = 0;
  let buffer = "";

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      buffer += event.delta.text;

      // デリミタ "---" で段落を区切る
      while (buffer.includes("\n---\n")) {
        const delimiterPos = buffer.indexOf("\n---\n");
        const before = buffer.slice(0, delimiterPos);
        if (before) {
          yield { index: currentIndex, delta: before };
        }
        yield { index: currentIndex, done: true };
        currentIndex++;
        buffer = buffer.slice(delimiterPos + 5); // "\n---\n".length === 5
      }

      // バッファに残っているテキストを送信
      if (buffer) {
        yield { index: currentIndex, delta: buffer };
        buffer = "";
      }
    }
  }

  // 最後の段落を完了
  yield { index: currentIndex, done: true };
}

export async function summarizeContext(
  client: Anthropic,
  text: string,
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 100,
    system: CONTEXT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Summarize this text:\n\n${text}` }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Failed to get context response");
  }
  return textBlock.text.trim();
}
