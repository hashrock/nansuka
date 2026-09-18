import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, notLike, sql } from "drizzle-orm";
import { users } from "./schema";

export type UserCounts = {
  total: number;
  new7d: number;
  new30d: number;
};

/** UI テストのシナリオが作る使い捨てユーザー (app/scenarios/apply.ts)。 */
const SCENARIO_ID_PATTERN = "scenario-%";
/** id に接頭辞が付く前に作られたシナリオユーザーもメールで見分ける。 */
const SCENARIO_EMAIL_PATTERN = "%@scenario.invalid";

/**
 * サインアップ数。repos の管理画面が /api/stats 経由で集める。
 *
 * created_at は toISOString() の "2026-09-18T12:00:00.000Z" 形式で、
 * datetime() の "2026-09-18 12:00:00" と文字列のまま比べると同じ日付の中で
 * 'T' > ' ' になって常に新しい側に数えてしまう。両辺を datetime() に通して比べる。
 */
export async function countUsers(
  db: DrizzleD1Database,
  now: Date = new Date(),
): Promise<UserCounts> {
  const at = now.toISOString();
  const since = (days: number) =>
    sql<number>`count(case when datetime(${users.createdAt}) >= datetime(${at}, ${`-${days} days`}) then 1 end)`;

  const row = await db
    .select({
      total: sql<number>`count(*)`,
      new7d: since(7),
      new30d: since(30),
    })
    .from(users)
    .where(
      and(notLike(users.id, SCENARIO_ID_PATTERN), notLike(users.email, SCENARIO_EMAIL_PATTERN)),
    )
    .get();

  return {
    total: row?.total ?? 0,
    new7d: row?.new7d ?? 0,
    new30d: row?.new30d ?? 0,
  };
}
