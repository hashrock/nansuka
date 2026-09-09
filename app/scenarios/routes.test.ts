import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "../global.d";
import type { SessionUser } from "../user";
import { authMiddleware } from "../auth/middleware";
import { fixedAuth } from "../auth/testing";
import { scenarios } from "./index";
import { FRESH_USER_REASON } from "./registry";

/**
 * DB も Cookie も無しで、シナリオ route の入口の判定だけを確かめる。
 * データを作る経路 (applyPlan) は D1 が要るので curl で確認している。
 */
const alice: SessionUser = { id: "alice", email: "alice@example.com", name: "Alice", avatarUrl: "" };

function appAs(user: SessionUser | null) {
  const auth = fixedAuth(user);
  const app = new Hono<Env>();
  app.use("*", authMiddleware(() => auth));
  app.route("/__scenarios", scenarios);
  const env = { SESSION_SECRET: "x" } as Env["Bindings"]; // DEV_BYPASS_AUTH 無し = 本番相当
  const get = (path: string, headers: Record<string, string> = {}) =>
    app.request(`http://localhost${path}`, { headers }, env);
  return { get, auth };
}

describe("GET /__scenarios", () => {
  it("lists every scenario and explains why some are unavailable", async () => {
    const res = await appAs(alice).get("/__scenarios");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("/__scenarios/typical");
    expect(html).toContain(alice.email);
    expect(html).toContain(FRESH_USER_REASON);
  });

  it("tells anonymous visitors to log in", async () => {
    const html = await (await appAs(null).get("/__scenarios")).text();
    expect(html).toContain("未ログインです");
  });
});

describe("GET /__scenarios/:name", () => {
  it("returns 404 for unknown names", async () => {
    const { get } = appAs(alice);
    expect((await get("/__scenarios/nope")).status).toBe(404);
    expect((await get("/__scenarios/nope?format=json")).status).toBe(404);
  });

  it("sends anonymous visitors through the normal login flow", async () => {
    const { get, auth } = appAs(null);
    const html = await get("/__scenarios/typical");
    expect(html.status).toBe(303);
    expect(html.headers.get("location")).toBe("/");

    const json = await get("/__scenarios/typical", { accept: "application/json" });
    expect(json.status).toBe(401);
    expect(await json.json()).toMatchObject({ loginUrl: "/auth/google" });
    expect(auth.signedIn).toHaveLength(0);
  });

  it("refuses fresh-user scenarios on a real account without signing anyone in", async () => {
    const { get, auth } = appAs(alice);
    const html = await get("/__scenarios/empty");
    expect(html.status).toBe(303);
    expect(html.headers.get("location")).toBe("/__scenarios?unavailable=empty");

    const json = await get("/__scenarios/no-credits?format=json");
    expect(json.status).toBe(409);
    expect(await json.json()).toMatchObject({ scenario: "no-credits", error: FRESH_USER_REASON });
    expect(auth.signedIn).toHaveLength(0);
  });
});
