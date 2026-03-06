import Anthropic from "@anthropic-ai/sdk";

interface Env {
  CF_AIG_TOKEN: string; // AI Gateway token
  AI_GATEWAY_URL: string; // e.g. https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic
  ASSETS: Fetcher;
}

// 翻訳用のシステムプロンプト
const TRANSLATE_SYSTEM_PROMPT = `You are a professional translator.
Translate each paragraph to the specified target language.
Return the translations as a JSON array in the same order as the input paragraphs.`;

// コンテキスト生成用のシステムプロンプト
const CONTEXT_SYSTEM_PROMPT = `Summarize the given text in one short sentence (max 20 words).
This summary will be used as context for translation.`;

// リクエストボディの型定義
interface TranslateParagraph {
  text: string;
  targetLanguage: string;
}

interface TranslateRequest {
  paragraphs: TranslateParagraph[];
  context?: string;
}

interface ContextRequest {
  text: string;
}

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
        items: {
          type: "string",
        },
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

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 翻訳エンドポイントのハンドラー
async function handleTranslate(
  body: string,
  client: Anthropic,
): Promise<Response> {
  let parsed: TranslateRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (
    !parsed.paragraphs ||
    !Array.isArray(parsed.paragraphs) ||
    parsed.paragraphs.length === 0
  ) {
    return jsonResponse(
      { error: "Missing required field: paragraphs (array)" },
      400,
    );
  }

  // 段落をフォーマットして送信
  const formattedParagraphs = parsed.paragraphs
    .map((p, i) => `[${i}] (to ${p.targetLanguage})\n${p.text}`)
    .join("\n\n---\n\n");

  const contextInfo = parsed.context ? `Context: ${parsed.context}\n\n` : "";
  const userMessage = `${contextInfo}Translate each paragraph below:\n\n${formattedParagraphs}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
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
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const toolUseBlock = message.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return jsonResponse({ error: "Failed to get structured response" }, 500);
    }

    const result = toolUseBlock.input as { translations: string[] };
    return jsonResponse({ translations: result.translations }, 200);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: "Translation failed", details: errorMessage },
      500,
    );
  }
}

// コンテキスト生成エンドポイントのハンドラー
async function handleContext(
  body: string,
  client: Anthropic,
): Promise<Response> {
  let parsed: ContextRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (!parsed.text) {
    return jsonResponse({ error: "Missing required field: text" }, 400);
  }

  const userMessage = `Summarize this text:\n\n${parsed.text}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
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
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const toolUseBlock = message.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return jsonResponse({ error: "Failed to get structured response" }, 500);
    }

    const result = toolUseBlock.input as { context: string };
    return jsonResponse({ context: result.context }, 200);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: "Context generation failed", details: errorMessage },
      500,
    );
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // APIルート以外は静的アセットにフォールバック
    if (url.pathname !== "/translate" && url.pathname !== "/context") {
      return env.ASSETS.fetch(request);
    }

    // POSTリクエストのみ許可
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // AI Gatewayトークンのチェック
    if (!env.CF_AIG_TOKEN) {
      return jsonResponse({ error: "AI Gateway token not configured" }, 500);
    }

    // Anthropicクライアントを初期化（AI Gateway経由、キーはGateway側で管理）
    const client = new Anthropic({
      apiKey: "unused",
      baseURL: env.AI_GATEWAY_URL,
      defaultHeaders: {
        "cf-aig-authorization": `Bearer ${env.CF_AIG_TOKEN}`,
      },
    });

    const body = await request.text();

    // ルーティング
    switch (url.pathname) {
      case "/translate":
        return handleTranslate(body, client);
      case "/context":
        return handleContext(body, client);
      default:
        return jsonResponse({ error: "Not found" }, 404);
    }
  },
};
