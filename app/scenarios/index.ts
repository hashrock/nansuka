import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../global.d";
import { isBypassEnabled } from "../auth/provider";
import { applyPlan, createScenarioUser } from "./apply";
import {
  SCENARIOS,
  findScenario,
  randomSuffix,
  resolveActor,
  scenarioLabel,
  wantsJson,
} from "./registry";
import { renderIndex } from "./page";

/**
 * UI テスト用シナリオ。`/__scenarios/<name>` を開くだけで所定の初期状態が
 * 新規に作られ、その画面へ 303 で送られる。詳細は docs/ui-test-scenarios.md。
 */
export const scenarios = new Hono<Env>();

scenarios.get("/", (c) => {
  const bypass = isBypassEnabled(c.env);
  const user = c.get("user");
  return c.html(
    renderIndex({
      scenarios: SCENARIOS.map((s) => ({
        ...s,
        actor: resolveActor(s, bypass, user),
      })),
      bypass,
      user,
      unavailable: c.req.query("unavailable") ?? null,
    }),
  );
});

scenarios.get("/:name", async (c) => {
  const json = wantsJson(c.req.query("format"), c.req.header("accept"));
  const name = c.req.param("name");
  const scenario = findScenario(name);
  if (!scenario) {
    return json
      ? c.json({ error: `Unknown scenario: ${name}` }, 404)
      : c.text(`Unknown scenario: ${name}`, 404);
  }

  const bypass = isBypassEnabled(c.env);
  const actor = resolveActor(scenario, bypass, c.get("user"));
  if (actor.kind === "login-required") {
    return json
      ? c.json({ error: "ログインが必要です", loginUrl: "/auth/google" }, 401)
      : c.redirect("/", 303);
  }
  if (actor.kind === "unavailable") {
    return json
      ? c.json({ error: actor.reason, scenario: name }, 409)
      : c.redirect(`/__scenarios?unavailable=${encodeURIComponent(name)}`, 303);
  }

  const db = drizzle(c.env.DB);
  const label = scenarioLabel(name, randomSuffix());

  let user;
  if (actor.kind === "fresh") {
    if (!c.env.SESSION_SECRET) {
      const error = "SESSION_SECRET が無いとシナリオ用ユーザーでログインできません";
      return json ? c.json({ error }, 500) : c.text(error, 500);
    }
    // 使い捨てユーザーを作り、本番と同じ入口 (auth.signIn) でそのユーザーになる。
    user = await createScenarioUser(db, label);
    await c.get("auth").signIn(c, user);
  } else {
    user = actor.user;
  }

  const result = await applyPlan(db, user.id, scenario.build(label), actor.kind === "fresh");
  if (json) {
    return c.json({
      scenario: name,
      label,
      url: result.url,
      user: { id: user.id, email: user.email, fresh: actor.kind === "fresh" },
      credits: result.credits,
      notes: result.notes,
    });
  }
  return c.redirect(result.url, 303);
});
