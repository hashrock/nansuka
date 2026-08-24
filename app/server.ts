import { Hono } from "hono";
import { inertia } from "@hono/inertia";
import Anthropic from "@anthropic-ai/sdk";
import { rootView } from "./root-view";
import {
  translate,
  summarizeContext,
  type TranslateRequest,
  type ContextRequest,
} from "./domain";
import type { Env } from "./global.d";

const app = new Hono<Env>();

// --- 翻訳 JSON API（Inertia 外・ページ遷移ではない非同期呼び出し） ---
function anthropicClient(env: Env["Bindings"]): Anthropic {
  return new Anthropic({
    apiKey: env.CF_AIG_TOKEN,
    baseURL: env.AI_GATEWAY_URL,
  });
}

app.post("/translate", async (c) => {
  if (!c.env.CF_AIG_TOKEN) {
    return c.json({ error: "AI Gateway token not configured" }, 500);
  }

  let parsed: TranslateRequest;
  try {
    parsed = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (
    !parsed.paragraphs ||
    !Array.isArray(parsed.paragraphs) ||
    parsed.paragraphs.length === 0
  ) {
    return c.json(
      { error: "Missing required field: paragraphs (array)" },
      400,
    );
  }

  try {
    const translations = await translate(anthropicClient(c.env), parsed);
    return c.json({ translations });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Translation failed", details }, 500);
  }
});

app.post("/context", async (c) => {
  if (!c.env.CF_AIG_TOKEN) {
    return c.json({ error: "AI Gateway token not configured" }, 500);
  }

  let parsed: ContextRequest;
  try {
    parsed = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!parsed.text) {
    return c.json({ error: "Missing required field: text" }, 400);
  }

  try {
    const context = await summarizeContext(anthropicClient(c.env), parsed.text);
    return c.json({ context });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Context generation failed", details }, 500);
  }
});

// --- Inertia ページ配信 ---
app.use(inertia({ rootView }));

app.get("/", (c) => c.render("Translate", {}));

export default app;
