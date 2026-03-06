import {
  translateStream,
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
  baseURL: string,
  apiKey: string,
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of translateStream(baseURL, apiKey, parsed)) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const errorEvent = JSON.stringify({ error: errorMessage });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function handleContext(
  body: string,
  baseURL: string,
  apiKey: string,
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
    const context = await summarizeContext(baseURL, apiKey, parsed.text);
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

    const body = await request.text();

    switch (url.pathname) {
      case "/translate":
        return handleTranslate(body, env.AI_GATEWAY_URL, env.CF_AIG_TOKEN);
      case "/context":
        return handleContext(body, env.AI_GATEWAY_URL, env.CF_AIG_TOKEN);
      default:
        return jsonResponse({ error: "Not found" }, 404);
    }
  },
};
