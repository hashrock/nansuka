import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import type { Env } from "../global.d";
import type { SessionUser } from "../user";
import { users } from "../db/schema";
import { createUser } from "../db/users";
import {
  clearUserCookie,
  getSignedUserCookie,
  setSignedUserCookie,
} from "../utils/session";
import type { AuthProvider } from "./provider";

/** 本番の session Cookie とは別名にして、sessionAuth が誤って読まないようにする。 */
export const IMPERSONATE_COOKIE = "impersonate";

export const DEV_USER: SessionUser = {
  id: "dev-user",
  email: "dev@localhost",
  name: "Dev User",
  avatarUrl: "",
};

/** Dev User を (無ければ作って) 返す。作り方は Google ログインと同じ関数を通す。 */
export async function ensureDevUser(c: Context<Env>): Promise<SessionUser> {
  const db = drizzle(c.env.DB);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, DEV_USER.id))
    .get();
  if (!existing) {
    await createUser(
      db,
      { email: DEV_USER.email, name: DEV_USER.name, avatarUrl: DEV_USER.avatarUrl },
      { id: DEV_USER.id },
    );
  }
  return DEV_USER;
}

/**
 * ローカル開発用。Google のクライアント ID を持たなくても触れるようにする。
 * 署名付きの impersonate Cookie があればそのユーザー、無ければ固定の Dev User。
 * signIn は impersonate Cookie を書くだけなので、シナリオ route や Google
 * callback は本番と同じ呼び方で「別のユーザーとして入る」ことができる。
 *
 * @param devUser 既定ユーザーの取得。テストでは DB を持たないスタブに差し替える。
 */
export function createBypassAuth(
  devUser: (c: Context<Env>) => Promise<SessionUser> = ensureDevUser,
): AuthProvider {
  return {
    resolve: async (c) =>
      (await getSignedUserCookie(c, IMPERSONATE_COOKIE)) ?? devUser(c),
    signIn: (c, user) => setSignedUserCookie(c, IMPERSONATE_COOKIE, user),
    signOut: async (c) => clearUserCookie(c, IMPERSONATE_COOKIE),
  };
}

export const bypassAuth: AuthProvider = createBypassAuth();
