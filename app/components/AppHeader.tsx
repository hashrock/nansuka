import { Link } from "@inertiajs/react";
import type { SessionUser } from "../user";

/** 全ページ共通のヘッダー。残高はここが唯一の表示場所。 */
export function AppHeader({
  user,
  credits,
  children,
}: {
  user: SessionUser;
  credits: number;
  children?: React.ReactNode;
}) {
  return (
    <header className="app-header">
      <Link href="/notes" className="brand">
        <img src="/logo.svg" alt="" className="logo" />
        <span className="title">Nansuka</span>
      </Link>

      {children}

      <Link
        href="/account"
        className={`credit-badge${credits <= 0 ? " is-empty" : ""}`}
        title="クレジット残高"
      >
        {credits.toLocaleString()} cr
      </Link>
      <Link href="/account" className="account-link">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="avatar" />
        ) : (
          <span className="avatar avatar-fallback">
            {(user.name || user.email).slice(0, 1).toUpperCase()}
          </span>
        )}
      </Link>
    </header>
  );
}
