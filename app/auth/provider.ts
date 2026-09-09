import type { Context } from "hono";
import type { Env } from "../global.d";
import type { SessionUser } from "../user";

/**
 * 「誰としてログインしているか」の出入口。本番は署名 Cookie のセッション、
 * ローカル開発では Dev User への差し替え、テストでは固定ユーザーのモック、と
 * 実装を差し替えられるようにし、ルート側は Cookie の形を知らずに済ませる。
 */
export interface AuthProvider {
  /** 毎リクエスト、ミドルウェアが呼ぶ。null = 未ログイン。 */
  resolve(c: Context<Env>): Promise<SessionUser | null>;
  /** 以後のリクエストで resolve が user を返すようにする (ブラウザは複数リクエストをまたぐ)。 */
  signIn(c: Context<Env>, user: SessionUser): Promise<void>;
  signOut(c: Context<Env>): Promise<void>;
}

/** ローカル開発で Google ログインを省略するかどうか。本番では設定しない。 */
export function isBypassEnabled(env: Pick<Env["Bindings"], "DEV_BYPASS_AUTH">): boolean {
  return Boolean(env.DEV_BYPASS_AUTH);
}
