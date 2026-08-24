import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { creditLedger, users } from "./schema";

export type SpendResult =
  | { ok: true; balance: number }
  | { ok: false; balance: number };

/**
 * 残高から引いて履歴に残す。
 *
 * 引き算は `credits >= amount` を条件に含めた1文のUPDATEで行う。読んでから
 * 書く形だと、翻訳リクエストが並列に飛んだときに残高チェックをすり抜けて
 * マイナスになりうる。RETURNING で更新後の残高をそのまま受け取り、行が
 * 返らなければ残高不足と判断する。
 */
export async function spendCredits(
  db: DrizzleD1Database,
  userId: string,
  amount: number,
  reason: string,
  noteId?: string,
): Promise<SpendResult> {
  if (amount <= 0) {
    return { ok: true, balance: await getBalance(db, userId) };
  }

  const updated = await db
    .update(users)
    .set({ credits: sql`${users.credits} - ${amount}` })
    .where(and(eq(users.id, userId), gte(users.credits, amount)))
    .returning({ credits: users.credits });

  const row = updated[0];
  if (!row) return { ok: false, balance: await getBalance(db, userId) };

  await db.insert(creditLedger).values({
    id: crypto.randomUUID(),
    userId,
    delta: -amount,
    reason,
    balance: row.credits,
    noteId: noteId ?? null,
    createdAt: new Date().toISOString(),
  });

  return { ok: true, balance: row.credits };
}

/** 付与。サインアップ時の初期付与や、後から足す運用で使う。 */
export async function grantCredits(
  db: DrizzleD1Database,
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  const updated = await db
    .update(users)
    .set({ credits: sql`${users.credits} + ${amount}` })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  const balance = updated[0]?.credits ?? 0;
  await db.insert(creditLedger).values({
    id: crypto.randomUUID(),
    userId,
    delta: amount,
    reason,
    balance,
    createdAt: new Date().toISOString(),
  });
  return balance;
}

export async function getBalance(
  db: DrizzleD1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.credits ?? 0;
}

export async function recentLedger(
  db: DrizzleD1Database,
  userId: string,
  limit = 20,
) {
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)
    .all();
}
