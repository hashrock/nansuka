interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string; // カンマ区切りのオリジンリスト
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// 本番環境のデフォルトオリジン
const DEFAULT_ALLOWED_ORIGIN = "https://hashrock.github.io";

// 翻訳用のシステムプロンプト
const TRANSLATE_SYSTEM_PROMPT = `You are a professional translator.
Translate each paragraph to the specified target language.
Output ONLY a JSON array of translated strings in the same order.
Example: ["translated paragraph 1", "translated paragraph 2"]
Do not include any explanations or additional text.`;

// コンテキスト生成用のシステムプロンプト
const CONTEXT_SYSTEM_PROMPT = `Summarize the given text in one short sentence (max 20 words).
This summary will be used as context for translation.
Output ONLY the summary, nothing else.`;

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

// Anthropic APIを呼び出す共通関数
async function callAnthropicAPI(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  maxTokens: number = 4096,
): Promise<Response> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });
  return response;
}

// レスポンスからテキストを抽出
async function extractTextFromResponse(
  response: Response,
): Promise<{ text: string | null; error: string | null; status: number }> {
  const data = await response.json();

  if (!response.ok) {
    return {
      text: null,
      error: data.error?.message || "API request failed",
      status: response.status,
    };
  }

  const textContent = data.content?.find(
    (c: { type: string }) => c.type === "text",
  );
  if (!textContent) {
    return {
      text: null,
      error: "No text content in response",
      status: 500,
    };
  }

  return {
    text: textContent.text,
    error: null,
    status: 200,
  };
}

// 翻訳エンドポイントのハンドラー
async function handleTranslate(
  body: string,
  apiKey: string,
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
    const anthropicResponse = await callAnthropicAPI(
      TRANSLATE_SYSTEM_PROMPT,
      userMessage,
      apiKey,
    );

    const result = await extractTextFromResponse(anthropicResponse);

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // JSONをパース
    let translations: string[];
    try {
      let text = result.text || "";
      // コードブロックを除去
      if (text.startsWith("```")) {
        text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      translations = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse translation response" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    return new Response(JSON.stringify({ translations }), {
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
  apiKey: string,
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
    const anthropicResponse = await callAnthropicAPI(
      CONTEXT_SYSTEM_PROMPT,
      userMessage,
      apiKey,
      100, // 短いコンテキスト用に小さいmax_tokens
    );

    const result = await extractTextFromResponse(anthropicResponse);

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ context: result.text }), {
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

    const body = await request.text();

    // ルーティング
    switch (url.pathname) {
      case "/translate":
        return handleTranslate(body, env.ANTHROPIC_API_KEY, corsHeaders);
      case "/context":
        return handleContext(body, env.ANTHROPIC_API_KEY, corsHeaders);
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
