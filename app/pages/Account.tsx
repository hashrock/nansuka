import { Head } from "@inertiajs/react";
import { AppHeader } from "../components/AppHeader";
import {
  CHARS_PER_CONTEXT_CREDIT,
  CHARS_PER_TRANSLATION_CREDIT,
} from "../domain/credits";
import type { SessionUser } from "../user";
import "../App.css";

type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  balance: number;
  createdAt: string;
};

const REASON_LABELS: Record<string, string> = {
  signup: "初期付与",
  translate: "翻訳",
  "translate:refund": "翻訳の失敗による返却",
  context: "コンテキスト要約",
  "context:refund": "コンテキスト要約の失敗による返却",
};

export default function Account({
  user,
  credits,
  ledger,
}: {
  user: SessionUser;
  credits: number;
  ledger: LedgerEntry[];
}) {
  return (
    <>
      <Head title="アカウント - Nansuka" />
      <div className="page">
        <AppHeader user={user} credits={credits} />

        <main className="account">
          <section>
            <h1>アカウント</h1>
            <dl className="account-fields">
              <dt>名前</dt>
              <dd>{user.name || "-"}</dd>
              <dt>メール</dt>
              <dd>{user.email}</dd>
            </dl>
            {/* OAuthのログアウトはInertiaではなく通常の遷移。 */}
            <a className="tool-btn" href="/auth/logout">
              ログアウト
            </a>
          </section>

          <section>
            <h2>クレジット</h2>
            <p className="credit-balance">{credits.toLocaleString()}</p>
            <p className="note">
              翻訳は段落ごとに {CHARS_PER_TRANSLATION_CREDIT} 文字で 1
              クレジット、コンテキスト要約は {CHARS_PER_CONTEXT_CREDIT} 文字で 1
              クレジットです（いずれも切り上げ）。
            </p>
          </section>

          <section>
            <h2>履歴</h2>
            {ledger.length === 0 ? (
              <p className="empty">まだ利用履歴がありません。</p>
            ) : (
              <table className="ledger">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>内容</th>
                    <th className="num">増減</th>
                    <th className="num">残高</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString("ja-JP")}</td>
                      <td>{REASON_LABELS[entry.reason] ?? entry.reason}</td>
                      <td className={`num ${entry.delta < 0 ? "minus" : "plus"}`}>
                        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                      </td>
                      <td className="num">{entry.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
