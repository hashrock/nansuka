import type { SessionUser } from "../user";
import type { AuthProvider } from "./provider";

/**
 * テスト用。resolve が固定のユーザーを返し、signIn/signOut は呼ばれたことだけ
 * 記録する。DB も Cookie も無しでハンドラの単体テストが書ける。
 */
export function fixedAuth(user: SessionUser | null): AuthProvider & {
  signedIn: SessionUser[];
  signedOut: number;
} {
  const provider = {
    signedIn: [] as SessionUser[],
    signedOut: 0,
    resolve: async () => user,
    signIn: async (_c: unknown, next: SessionUser) => {
      provider.signedIn.push(next);
    },
    signOut: async () => {
      provider.signedOut += 1;
    },
  };
  return provider;
}
