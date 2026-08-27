import { Hono } from "hono";
import { inertia } from "@hono/inertia";
import { googleAuth } from "@hono/oauth-providers/google";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { rootView } from "./root-view";
import {
  translate,
  summarizeContext,
  type TranslateRequest,
  type ContextRequest,
} from "./domain";
import { contextCost, insufficientCreditsMessage, translationCost } from "./domain/credits";
import { deriveNoteTitle } from "./domain/noteTitle";
import { normalizePrompt } from "./domain/prompt";
import { users, INITIAL_CREDITS } from "./db/schema";
import { getBalance, grantCredits, recentLedger, spendCredits } from "./db/credits";
import {
  createNote,
  deleteNote,
  listNotes,
  loadOwnedNote,
  updateNote,
} from "./db/notes";
import { getSession, setSession, clearSession } from "./utils/session";
import type { Env } from "./global.d";

const DEV_USER = {
  id: "dev-user",
  email: "dev@localhost",
  name: "Dev User",
  avatarUrl: "",
};

const app = new Hono<Env>();

// --- セッション ------------------------------------------------------

app.use("*", async (c, next) => {
  // ローカル開発ではGoogleのクライアントIDを持たなくても触れるようにする。
  if (c.env.DEV_BYPASS_AUTH) {
    const db = drizzle(c.env.DB);
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.id, DEV_USER.id))
      .get();
    if (!existing) {
      await db.insert(users).values({
        id: DEV_USER.id,
        email: DEV_USER.email,
        name: DEV_USER.name,
        avatarUrl: DEV_USER.avatarUrl,
        credits: INITIAL_CREDITS,
        createdAt: new Date().toISOString(),
      });
    }
    c.set("user", DEV_USER);
    return next();
  }

  c.set("user", await getSession(c));
  return next();
});

// --- 認証 (Inertiaではなく通常のリダイレクト) ------------------------

app.get(
  "/auth/google",
  googleAuth({
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  }),
  async (c) => {
    const googleUser = c.get("user-google");
    if (!googleUser?.email) return c.redirect("/?error=auth");

    const db = drizzle(c.env.DB);
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .get();

    let userId: string;
    if (existing) {
      userId = existing.id;
      await db
        .update(users)
        .set({
          name: googleUser.name || existing.name,
          avatarUrl: googleUser.picture || existing.avatarUrl,
        })
        .where(eq(users.id, existing.id));
    } else {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: googleUser.email,
        name: googleUser.name || null,
        avatarUrl: googleUser.picture || null,
        // 既定値ではなく0で作ってから付与する。初期付与も履歴に残したい。
        credits: 0,
        createdAt: new Date().toISOString(),
      });
      await grantCredits(db, userId, INITIAL_CREDITS, "signup");
    }

    await setSession(c, {
      id: userId,
      email: googleUser.email,
      name: googleUser.name || "",
      avatarUrl: googleUser.picture || "",
    });

    return c.redirect("/notes");
  },
);

app.get("/auth/logout", (c) => {
  clearSession(c);
  return c.redirect("/");
});

// --- 翻訳API (Inertia外の非同期呼び出し) -----------------------------

function anthropicClient(env: Env["Bindings"]): Anthropic {
  return new Anthropic({
    apiKey: env.CF_AIG_TOKEN,
    baseURL: env.AI_GATEWAY_URL,
  });
}

app.post("/translate", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!c.env.CF_AIG_TOKEN) {
    return c.json({ error: "AI Gateway token not configured" }, 500);
  }

  let parsed: TranslateRequest & { noteId?: string };
  try {
    parsed = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!Array.isArray(parsed.paragraphs) || parsed.paragraphs.length === 0) {
    return c.json({ error: "Missing required field: paragraphs (array)" }, 400);
  }

  const db = drizzle(c.env.DB);
  const cost = translationCost(parsed.paragraphs.map((p) => p.text ?? ""));
  const spent = await spendCredits(db, user.id, cost, "translate", parsed.noteId);
  if (!spent.ok) {
    return c.json(
      {
        error: insufficientCreditsMessage(spent.balance, cost),
        credits: spent.balance,
        cost,
      },
      402,
    );
  }

  try {
    const translations = await translate(anthropicClient(c.env), parsed);
    return c.json({ translations, credits: spent.balance, cost });
  } catch (error) {
    // 翻訳できなかった分は取らない。
    const balance = await grantCredits(db, user.id, cost, "translate:refund");
    const details = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Translation failed", details, credits: balance }, 500);
  }
});

app.post("/context", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!c.env.CF_AIG_TOKEN) {
    return c.json({ error: "AI Gateway token not configured" }, 500);
  }

  let parsed: ContextRequest & { noteId?: string };
  try {
    parsed = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  if (!parsed.text) {
    return c.json({ error: "Missing required field: text" }, 400);
  }

  const db = drizzle(c.env.DB);
  const cost = contextCost(parsed.text);
  const spent = await spendCredits(db, user.id, cost, "context", parsed.noteId);
  if (!spent.ok) {
    return c.json(
      {
        error: insufficientCreditsMessage(spent.balance, cost),
        credits: spent.balance,
        cost,
      },
      402,
    );
  }

  try {
    const context = await summarizeContext(anthropicClient(c.env), parsed.text);
    return c.json({ context, credits: spent.balance, cost });
  } catch (error) {
    const balance = await grantCredits(db, user.id, cost, "context:refund");
    const details = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: "Context generation failed", details, credits: balance }, 500);
  }
});

// --- ノートのオートセーブ (Inertia外) --------------------------------

app.put("/api/notes/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  let body: { content?: string; sources?: string[]; prompt?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // 本文の自動保存とプロンプトの保存は別々に飛んでくる。
  // 片方の保存でもう片方を消さないよう、送られてきた項目だけ更新する。
  const patch: { content?: string; title?: string; prompt?: string | null } = {};
  if (typeof body.content === "string") {
    patch.content = body.content;
    patch.title = deriveNoteTitle(body.sources ?? []);
  }
  if ("prompt" in body) {
    patch.prompt = normalizePrompt(body.prompt);
  }
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "Nothing to update: content or prompt" }, 400);
  }

  const db = drizzle(c.env.DB);
  const ok = await updateNote(db, c.req.param("id"), user.id, patch);
  if (!ok) return c.json({ error: "Not found" }, 404);

  return c.json({ ok: true });
});

// --- Inertiaページ ---------------------------------------------------

app.use(inertia({ rootView }));

app.get("/", (c) => {
  const user = c.get("user");
  if (user) return c.redirect("/notes");
  return c.render("Landing", { error: c.req.query("error") ?? null });
});

app.get("/notes", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/");

  const db = drizzle(c.env.DB);
  const [rows, credits] = await Promise.all([
    listNotes(db, user.id),
    getBalance(db, user.id),
  ]);

  return c.render("Notes/Index", {
    user,
    credits,
    notes: rows.map((note) => ({
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    })),
  });
});

app.post("/notes", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/");

  // ローカルの下書きを持ち込む場合はその中身で作る。
  const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const content = typeof body.content === "string" ? body.content : "[]";
  const title = typeof body.title === "string" && body.title ? body.title : undefined;

  const db = drizzle(c.env.DB);
  const note = await createNote(db, user.id, title, content);
  return c.redirect(`/notes/${note.id}`);
});

app.get("/notes/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/");

  const db = drizzle(c.env.DB);
  const note = await loadOwnedNote(db, c.req.param("id"), user.id);
  if (!note) return c.redirect("/notes");

  const credits = await getBalance(db, user.id);
  return c.render("Translate", {
    user,
    credits,
    note: {
      id: note.id,
      title: note.title,
      content: note.content,
      prompt: note.prompt,
    },
  });
});

app.post("/notes/:id/delete", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/");

  const db = drizzle(c.env.DB);
  await deleteNote(db, c.req.param("id"), user.id);
  return c.redirect("/notes");
});

app.get("/account", async (c) => {
  const user = c.get("user");
  if (!user) return c.redirect("/");

  const db = drizzle(c.env.DB);
  const [credits, ledger] = await Promise.all([
    getBalance(db, user.id),
    recentLedger(db, user.id),
  ]);

  return c.render("Account", {
    user,
    credits,
    ledger: ledger.map((entry) => ({
      id: entry.id,
      delta: entry.delta,
      reason: entry.reason,
      balance: entry.balance,
      createdAt: entry.createdAt,
    })),
  });
});

export default app;
