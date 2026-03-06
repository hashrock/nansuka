import Anthropic from "@anthropic-ai/sdk";
import {
  translate,
  summarizeContext,
  type TranslateRequest,
  type ContextRequest,
} from "./domain";

interface Env {
  CF_AIG_TOKEN: string;
  AI_GATEWAY_URL: string;
  ASSETS: Fetcher;
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

  try {
    const translations = await translate(client, parsed);
    return jsonResponse({ translations }, 200);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      { error: "Translation failed", details: errorMessage },
      500,
    );
  }
}

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

  try {
    const context = await summarizeContext(client, parsed.text);
    return jsonResponse({ context }, 200);
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

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!env.CF_AIG_TOKEN) {
      return jsonResponse({ error: "AI Gateway token not configured" }, 500);
    }

    const client = new Anthropic({
      apiKey: env.CF_AIG_TOKEN,
      baseURL: env.AI_GATEWAY_URL,
    });

    const body = await request.text();

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
