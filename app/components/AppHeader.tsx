import { Link } from "@inertiajs/react";
import type { SessionUser } from "../user";

/** 全ページ共通のヘッダー。残高はここが唯一の表示場所。 */
export function AppHeader({
  user,
  credits,
  showBack = false,
  children,
}: {
  user: SessionUser;
  credits: number;
  /**
   * ノート一覧への戻りリンクを出す。ロゴも一覧へ飛ぶが、それが戻る手段だと
   * 気付けなかった (#16) ので、一覧以外の画面では文字で示す。
   */
  showBack?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="app-header">
      <Link href="/notes" className="brand">
        <img src="/logo.svg" alt="" className="logo" />
        <span className="title">Nansuka</span>
      </Link>
      {showBack && (
        <Link href="/notes" className="back-link">
          ‹ 一覧
        </Link>
      )}

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
