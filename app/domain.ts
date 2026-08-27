import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./config";
import { normalizeStyle, styleInstructions, type StyleParams } from "./domain/style";
import { DEFAULT_TASK_PROMPT, normalizePrompt } from "./domain/prompt";

// リクエスト/レスポンスの型定義
export interface TranslateParagraph {
  text: string;
  targetLanguage: string;
}

export interface TranslateRequest {
  paragraphs: TranslateParagraph[];
  context?: string;
  /** 文章調整パネルの値。省略時は指定なし。 */
  style?: Partial<StyleParams>;
  /** ノート固有の指示。省略時は既定の翻訳プロンプト。 */
  prompt?: string | null;
}

export interface ContextRequest {
  text: string;
}

// システムプロンプト。タスク部分はノートごとに差し替わり、出力形式は固定。
const OUTPUT_FORMAT_PROMPT = `Process each paragraph independently.
Return the results as a JSON array of strings in the same order as the input paragraphs, one result per paragraph.`;

function translateSystemPrompt(customPrompt: string | null): string {
  return `${customPrompt ?? DEFAULT_TASK_PROMPT}\n\n${OUTPUT_FORMAT_PROMPT}`;
}

const CONTEXT_SYSTEM_PROMPT = `Summarize the given text in one short sentence (max 20 words).
Write the summary in the same language as the text.
This summary will be used as background context for processing the text paragraph by paragraph.`;

// Structured Output用のスキーマ定義
const translateSchema = {
  name: "translate_result",
  description: "Results for multiple paragraphs",
  strict: true,
  schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: { type: "string" },
        description:
          "Array of result strings in the same order as input paragraphs",
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
  const customPrompt = normalizePrompt(req.prompt);
  // 既定の翻訳では段落ごとに訳す先の言語を添える。独自プロンプトでは
  // 翻訳とは限らないので付けず、指示文に任せる。
  const formattedParagraphs = req.paragraphs
    .map((p, i) =>
      customPrompt
        ? `[${i}]\n${p.text}`
        : `[${i}] (to ${p.targetLanguage})\n${p.text}`,
    )
    .join("\n\n---\n\n");

  const contextInfo = req.context ? `Context: ${req.context}\n\n` : "";
  const style = styleInstructions(normalizeStyle(req.style), customPrompt !== null);
  const styleInfo = style ? `${style}\n\n` : "";
  const task = customPrompt
    ? "Apply the instructions to each paragraph below:"
    : "Translate each paragraph below:";
  const userMessage = `${contextInfo}${styleInfo}${task}\n\n${formattedParagraphs}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: translateSystemPrompt(customPrompt),
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
