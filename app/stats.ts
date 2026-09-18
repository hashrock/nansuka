import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { countUsers } from "./db/stats";
import type { Env } from "./global.d";

export const SERVICE_NAME = "nansuka";

/**
 * GET /api/stats — repos.hashrock.info の管理画面がサインアップ数を集めに来る。
 *
 * セッションや AuthProvider には頼らず、STATS_TOKEN の Bearer だけで通す。
 * STATS_TOKEN が未設定なら endpoint ごと無いことにする (404)。
 */
export function statsRoutes(clock: () => Date = () => new Date()) {
  const app = new Hono<Env>();

  app.get("/", async (c) => {
    c.header("Cache-Control", "no-store");

    const expected = c.env.STATS_TOKEN;
    if (!expected) return c.json({ error: "Not found" }, 404);

    const presented = bearerToken(c.req.header("authorization"));
    if (presented === null || !(await tokensMatch(presented, expected))) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const now = clock();
    const counts = await countUsers(drizzle(c.env.DB), now);
    return c.json({
      service: SERVICE_NAME,
      generated_at: now.toISOString(),
      users: { total: counts.total, new_7d: counts.new7d, new_30d: counts.new30d },
    });
  });

  return app;
}

export function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * 定数時間の比較。先に SHA-256 に通して長さを揃え、全バイトを見終わるまで
 * 途中で抜けない。Workers の crypto.subtle.timingSafeEqual は Node (テスト) に無いので使わない。
 */
export async function tokensMatch(presented: string, expected: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(presented), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
