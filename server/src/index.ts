interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string; // カンマ区切りのオリジンリスト
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// 本番環境のデフォルトオリジン
const DEFAULT_ALLOWED_ORIGIN = "https://hashrock.github.io";

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
    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key, anthropic-version",
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

    try {
      const body = await request.text();

      // Anthropic APIへリクエストを転送
      const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: body,
      });

      // レスポンスをそのまま返す
      const responseBody = await anthropicResponse.text();
      return new Response(responseBody, {
        status: anthropicResponse.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: "Proxy error", details: errorMessage }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        },
      );
    }
  },
};
