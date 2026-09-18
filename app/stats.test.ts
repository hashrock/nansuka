import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "./global.d";
import { countUsers } from "./db/stats";
import { sqliteD1 } from "./db/testing";
import { bearerToken, statsRoutes, tokensMatch } from "./stats";

const NOW = new Date("2026-09-18T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function seed(rows: { id: string; email?: string; createdAt: string }[]) {
  const { d1, sqlite } = sqliteD1();
  const insert = sqlite.prepare(
    "INSERT INTO users (id, email, name, credits, created_at) VALUES (?, ?, ?, 0, ?)",
  );
  for (const row of rows) {
    insert.run(row.id, row.email ?? `${row.id}@example.com`, row.id, row.createdAt);
  }
  return d1;
}

describe("countUsers", () => {
  it("counts exactly 7 / 30 days ago as new, and one second earlier as not", async () => {
    const d1 = seed([
      { id: "at-7d", createdAt: ago(7 * DAY_MS) },
      { id: "before-7d", createdAt: ago(7 * DAY_MS + 1000) },
      { id: "at-30d", createdAt: ago(30 * DAY_MS) },
      { id: "before-30d", createdAt: ago(30 * DAY_MS + 1000) },
      { id: "today", createdAt: ago(0) },
    ]);
    expect(await countUsers(drizzle(d1), NOW)).toEqual({ total: 5, new7d: 2, new30d: 4 });
  });

  it("compares by time, not by the ISO string against datetime()'s format", async () => {
    // 7 日と 1 時間前 (日付は 7 日前と同じ) は対象外。文字列比較だと 'T' > ' ' で数えてしまう。
    const d1 = seed([
      { id: "same-day-earlier", createdAt: new Date(NOW.getTime() - 7 * DAY_MS - 3600_000).toISOString() },
    ]);
    expect(await countUsers(drizzle(d1), NOW)).toEqual({ total: 1, new7d: 0, new30d: 1 });
  });

  it("excludes UI test scenario users by id prefix and by their email domain", async () => {
    const d1 = seed([
      { id: "real", createdAt: ago(0) },
      { id: "scenario-typical-ab12cd", createdAt: ago(0) },
      { id: "0b6f-legacy-uuid", email: "scenario-empty-zz99yy@scenario.invalid", createdAt: ago(0) },
    ]);
    expect(await countUsers(drizzle(d1), NOW)).toEqual({ total: 1, new7d: 1, new30d: 1 });
  });

  it("returns zeros for an empty table", async () => {
    expect(await countUsers(drizzle(seed([])), NOW)).toEqual({ total: 0, new7d: 0, new30d: 0 });
  });
});

describe("GET /api/stats", () => {
  function request(env: Partial<Env["Bindings"]>, headers: Record<string, string> = {}) {
    const app = statsRoutes(() => NOW);
    return app.request("http://localhost/", { headers }, env as Env["Bindings"]);
  }

  it("is 404 when STATS_TOKEN is not configured, even with a header", async () => {
    const res = await request({}, { authorization: "Bearer anything" });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("is 401 for a missing or wrong token", async () => {
    const env = { STATS_TOKEN: "secret-token" };
    expect((await request(env)).status).toBe(401);
    expect((await request(env, { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await request(env, { authorization: "secret-token" })).status).toBe(401);
    expect((await request(env, { authorization: "Bearer secret-token-x" })).status).toBe(401);
  });

  it("returns the counts as JSON for the right token", async () => {
    const DB = seed([
      { id: "a", createdAt: ago(DAY_MS) },
      { id: "b", createdAt: ago(20 * DAY_MS) },
      { id: "c", createdAt: ago(90 * DAY_MS) },
      { id: "scenario-large-aaaaaa", createdAt: ago(0) },
    ]);
    const res = await request({ STATS_TOKEN: "secret-token", DB }, { authorization: "Bearer secret-token" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      service: "nansuka",
      generated_at: "2026-09-18T12:00:00.000Z",
      users: { total: 3, new_7d: 1, new_30d: 2 },
    });
  });
});

describe("token helpers", () => {
  it("parses the Bearer scheme case-insensitively", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer  abc ")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });

  it("compares tokens of different lengths without throwing", async () => {
    expect(await tokensMatch("abc", "abc")).toBe(true);
    expect(await tokensMatch("abc", "abcd")).toBe(false);
    expect(await tokensMatch("", "abc")).toBe(false);
  });
});
