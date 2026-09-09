import type { AuthProvider } from "./provider";
import { clearSession, getSession, setSession } from "../utils/session";

/**
 * 本番用。署名付きセッション Cookie をそのまま使う。
 * dev バイパスの impersonate Cookie は名前が違うので、ここでは一切読まない。
 */
export const sessionAuth: AuthProvider = {
  resolve: (c) => getSession(c),
  signIn: (c, user) => setSession(c, user),
  signOut: async (c) => clearSession(c),
};
