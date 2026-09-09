import type { MiddlewareHandler } from "hono";
import type { Env } from "../global.d";
import { isBypassEnabled, type AuthProvider } from "./provider";
import { sessionAuth } from "./sessionAuth";
import { bypassAuth } from "./bypassAuth";

/** どの provider を使うかを決める唯一の場所。 */
export function selectAuth(env: Env["Bindings"]): AuthProvider {
  return isBypassEnabled(env) ? bypassAuth : sessionAuth;
}

/**
 * 毎リクエスト、ログイン中のユーザーと provider を context に載せる。
 * 分岐は provider の選択だけで、ミドルウェア自身は Cookie を読まない。
 */
export function authMiddleware(
  select: (env: Env["Bindings"]) => AuthProvider = selectAuth,
): MiddlewareHandler<Env> {
  return async (c, next) => {
    const auth = select(c.env);
    c.set("auth", auth);
    c.set("user", await auth.resolve(c));
    await next();
  };
}
