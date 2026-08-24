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
Return the translations as a JSON array in the same order as the input paragraphs.`;

const CONTEXT_SYSTEM_PROMPT = `Summarize the given text in one short sentence (max 20 words).
This summary will be used as context for translation.`;

// Structured Output用のスキーマ定義
const translateSchema = {
  name: "translate_result",
  description: "Translation results for multiple paragraphs",
  strict: true,
  schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of translated text strings in the same order as input paragraphs",
      },
    },
    required: ["translations"],
    additionalProperties: false,
  },
} as const;

const contextSchema = {
  name: "context_result",
  description: "A short summary for translation context",
  strict: true,
  schema: {
    type: "object",
    properties: {
      context: {
        type: "string",
        description: "A brief summary (max 20 words) of the input text",
      },
    },
    required: ["context"],
    additionalProperties: false,
  },
} as const;

function extractToolInput<T>(message: Anthropic.Message): T {
  const toolUseBlock = message.content.find(
    (block) => block.type === "tool_use",
  );
  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Failed to get structured response");
  }
  return toolUseBlock.input as T;
}

export async function translate(
  client: Anthropic,
  req: TranslateRequest,
): Promise<string[]> {
  const formattedParagraphs = req.paragraphs
    .map((p, i) => `[${i}] (to ${p.targetLanguage})\n${p.text}`)
    .join("\n\n---\n\n");

  const contextInfo = req.context ? `Context: ${req.context}\n\n` : "";
  const userMessage = `${contextInfo}Translate each paragraph below:\n\n${formattedParagraphs}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: TRANSLATE_SYSTEM_PROMPT,
    tools: [
      {
        name: translateSchema.name,
        description: translateSchema.description,
        input_schema: translateSchema.schema,
      },
    ],
    tool_choice: { type: "tool", name: translateSchema.name },
    messages: [{ role: "user", content: userMessage }],
  });

  const result = extractToolInput<{ translations: string[] }>(message);
  return result.translations;
}

export async function summarizeContext(
  client: Anthropic,
  text: string,
): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 100,
    system: CONTEXT_SYSTEM_PROMPT,
    tools: [
      {
        name: contextSchema.name,
        description: contextSchema.description,
        input_schema: contextSchema.schema,
      },
    ],
    tool_choice: { type: "tool", name: contextSchema.name },
    messages: [{ role: "user", content: `Summarize this text:\n\n${text}` }],
  });

  const result = extractToolInput<{ context: string }>(message);
  return result.context;
}
