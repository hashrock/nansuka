import type { SessionUser } from "./user";

declare module "hono" {
  interface ContextVariableMap {
    user: SessionUser | null;
  }
}

export type Env = {
  Bindings: {
    DB: D1Database;
    CF_AIG_TOKEN: string;
    AI_GATEWAY_URL: string;
    SESSION_SECRET: string;
    GOOGLE_ID: string;
    GOOGLE_SECRET: string;
    /** ローカル開発でGoogleログインを省略する。本番では設定しない。 */
    DEV_BYPASS_AUTH?: string;
  };
  Variables: {
    user: SessionUser | null;
  };
};
