import Anthropic from "@anthropic-ai/sdk";

interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string; // カンマ区切りのオリジンリスト
}

// 本番環境のデフォルトオリジン
const DEFAULT_ALLOWED_ORIGIN = "https://hashrock.github.io";

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

function getAllowedOrigins(env: Env): string[] {
  if (env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  }
  return [DEFAULT_ALLOWED_ORIGIN];
}

function getCorsHeaders(
  origin: string | null,
  allowedOrigins: string[],
): HeadersInit {
  const allowedOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function isOriginAllowed(
  origin: string | null,
  allowedOrigins: string[],
  isLocal: boolean,
): boolean {
  // ローカル開発時はOriginなしも許可（Viteプロキシ経由）
  if (!origin) return isLocal;
  return allowedOrigins.includes(origin);
}

function isLocalDev(env: Env): boolean {
  // ALLOWED_ORIGINSにlocalhostが含まれていればローカル開発とみなす
  return env.ALLOWED_ORIGINS?.includes("localhost") ?? false;
}

// 翻訳エンドポイントのハンドラー
async function handleTranslate(
  body: string,
  client: Anthropic,
  corsHeaders: HeadersInit,
): Promise<Response> {
  let parsed: TranslateRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (
    !parsed.paragraphs ||
    !Array.isArray(parsed.paragraphs) ||
    parsed.paragraphs.length === 0
  ) {
    return new Response(
      JSON.stringify({
        error: "Missing required field: paragraphs (array)",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
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

    // tool_useブロックから結果を抽出
    const toolUseBlock = message.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return new Response(
        JSON.stringify({ error: "Failed to get structured response" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const result = toolUseBlock.input as { translations: string[] };

    return new Response(JSON.stringify({ translations: result.translations }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Translation failed", details: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}

// コンテキスト生成エンドポイントのハンドラー
async function handleContext(
  body: string,
  client: Anthropic,
  corsHeaders: HeadersInit,
): Promise<Response> {
  let parsed: ContextRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!parsed.text) {
    return new Response(
      JSON.stringify({ error: "Missing required field: text" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
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

    // tool_useブロックから結果を抽出
    const toolUseBlock = message.content.find(
      (block) => block.type === "tool_use",
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return new Response(
        JSON.stringify({ error: "Failed to get structured response" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const result = toolUseBlock.input as { context: string };

    return new Response(JSON.stringify({ context: result.context }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: "Context generation failed",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const allowedOrigins = getAllowedOrigins(env);
    const isLocal = isLocalDev(env);
    const origin = request.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin, allowedOrigins);
    const url = new URL(request.url);

    // プリフライトリクエストの処理
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // オリジンチェック
    if (!isOriginAllowed(origin, allowedOrigins, isLocal)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Origin not allowed" }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        },
      );
    }

    // POSTリクエストのみ許可
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // APIキーのチェック
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    // Anthropicクライアントを初期化
    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const body = await request.text();

    // ルーティング
    switch (url.pathname) {
      case "/translate":
        return handleTranslate(body, client, corsHeaders);
      case "/context":
        return handleContext(body, client, corsHeaders);
      default:
        return new Response(
          JSON.stringify({
            error: "Not found",
            availableEndpoints: ["/translate", "/context"],
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          },
        );
    }
  },
};
