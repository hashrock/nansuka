import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env } from "../global.d";
import type { SessionUser } from "../user";
import { sessionAuth } from "./sessionAuth";
import { createBypassAuth, DEV_USER, IMPERSONATE_COOKIE } from "./bypassAuth";
import { authMiddleware } from "./middleware";
import type { AuthProvider } from "./provider";
import { SESSION_COOKIE } from "../utils/session";

const SECRET = "test-secret";
const env = { SESSION_SECRET: SECRET, DB: {} as D1Database } as Env["Bindings"];
const alice: SessionUser = { id: "alice", email: "alice@example.com", name: "Alice", avatarUrl: "" };

/** provider を通した結果を JSON で返す最小アプリ。 */
function appWith(auth: AuthProvider) {
  const app = new Hono<Env>();
  app.use("*", authMiddleware(() => auth));
  app.get("/whoami", (c) => c.json(c.get("user")));
  app.get("/signin", async (c) => {
    await c.get("auth").signIn(c, alice);
    return c.text("ok");
  });
  app.get("/signout", async (c) => {
    await c.get("auth").signOut(c);
    return c.text("ok");
  });
  return app;
}

function cookieValue(res: Response, name: string): string | undefined {
  const header = res.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|, ?)${name}=([^;]*)`));
  return match?.[1];
}

/** signIn が書いた Cookie を取り出す。 */
async function issue(auth: AuthProvider, name: string): Promise<string> {
  const res = await appWith(auth).request("http://localhost/signin", {}, env);
  const value = cookieValue(res, name);
  if (!value) throw new Error(`${name} cookie was not set`);
  return `${name}=${value}`;
}

async function whoami(auth: AuthProvider, cookie?: string): Promise<SessionUser | null> {
  const res = await appWith(auth).request(
    "http://localhost/whoami",
    { headers: cookie ? { cookie } : {} },
    env,
  );
  return res.json();
}

const bypass = createBypassAuth(async () => DEV_USER);

describe("sessionAuth (production)", () => {
  it("returns null without a cookie", async () => {
    expect(await whoami(sessionAuth)).toBeNull();
  });

  it("round-trips the user through the signed session cookie", async () => {
    const cookie = await issue(sessionAuth, SESSION_COOKIE);
    expect(await whoami(sessionAuth, cookie)).toEqual(alice);
  });

  it("ignores a validly signed impersonate cookie", async () => {
    // bypass が書く Cookie は本番の provider には何の意味も持たない。
    const cookie = await issue(bypass, IMPERSONATE_COOKIE);
    expect(await whoami(sessionAuth, cookie)).toBeNull();
  });

  it("rejects a tampered session cookie", async () => {
    const cookie = await issue(sessionAuth, SESSION_COOKIE);
    expect(await whoami(sessionAuth, cookie.replace(/\.[^.]*$/, ".AAAA"))).toBeNull();
  });

  it("signOut clears the session cookie", async () => {
    const res = await appWith(sessionAuth).request("http://localhost/signout", {}, env);
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });
});

describe("bypassAuth (DEV_BYPASS_AUTH)", () => {
  it("falls back to the dev user without a cookie", async () => {
    expect(await whoami(bypass)).toEqual(DEV_USER);
  });

  it("impersonates the user from its own signed cookie", async () => {
    const cookie = await issue(bypass, IMPERSONATE_COOKIE);
    expect(await whoami(bypass, cookie)).toEqual(alice);
  });

  it("does not read the production session cookie", async () => {
    const cookie = await issue(sessionAuth, SESSION_COOKIE);
    expect(await whoami(bypass, cookie)).toEqual(DEV_USER);
  });

  it("ignores a tampered impersonate cookie and returns to the dev user", async () => {
    const cookie = await issue(bypass, IMPERSONATE_COOKIE);
    expect(await whoami(bypass, cookie.replace(/\.[^.]*$/, ".AAAA"))).toEqual(DEV_USER);
  });

  it("signOut clears only the impersonate cookie", async () => {
    const res = await appWith(bypass).request("http://localhost/signout", {}, env);
    const header = res.headers.get("set-cookie") ?? "";
    expect(header).toMatch(new RegExp(`${IMPERSONATE_COOKIE}=;`));
    expect(header).not.toContain(`${SESSION_COOKIE}=`);
  });
});
