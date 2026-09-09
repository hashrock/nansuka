import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import type { SessionUser } from "../user";

export const SESSION_COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * セッションはHMAC署名付きのCookieに載せる。サーバー側にセッション表を持たない
 * ぶん失効はできないが、D1への読み取りがリクエストごとに増えない。
 *
 * 署名の付け方は Cookie 名に依らないので、同じ形式の別 Cookie
 * (dev バイパスの impersonate) にも使う。形式を変えると既存のセッションが
 * 全部無効になるので、Hono 組み込みの signedCookie には移さない。
 */
async function importKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret, "sign");
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

async function verify(token: string, secret: string): Promise<string | null> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.slice(0, lastDot);
  const sigB64 = token.slice(lastDot + 1);

  try {
    const key = await importKey(secret, "verify");
    const sig = Uint8Array.from(atob(sigB64), (ch) => ch.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      new TextEncoder().encode(payload),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

/** ユーザー像を署名して Cookie に書く。 */
export async function setSignedUserCookie(
  c: Context,
  name: string,
  user: SessionUser,
): Promise<void> {
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(user))));
  const token = await sign(payload, c.env.SESSION_SECRET);
  const isLocalhost = new URL(c.req.url).hostname === "localhost";
  setCookie(c, name, token, {
    path: "/",
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "Lax",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** 署名が正しいときだけユーザー像を返す。無い・壊れている・偽物は null。 */
export async function getSignedUserCookie(
  c: Context,
  name: string,
): Promise<SessionUser | null> {
  const token = getCookie(c, name);
  if (!token) return null;
  if (!c.env.SESSION_SECRET) return null;

  const payload = await verify(token, c.env.SESSION_SECRET);
  if (!payload) return null;

  try {
    const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as SessionUser;
  } catch {
    return null;
  }
}

export function clearUserCookie(c: Context, name: string) {
  deleteCookie(c, name, { path: "/" });
}

export const setSession = (c: Context, user: SessionUser) =>
  setSignedUserCookie(c, SESSION_COOKIE, user);
export const getSession = (c: Context) => getSignedUserCookie(c, SESSION_COOKIE);
export const clearSession = (c: Context) => clearUserCookie(c, SESSION_COOKIE);
