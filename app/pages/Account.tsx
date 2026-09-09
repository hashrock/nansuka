import { Head } from "@inertiajs/react";
import { AppHeader } from "../components/AppHeader";
import {
  CHARS_PER_CONTEXT_CREDIT,
  CHARS_PER_TRANSLATION_CREDIT,
} from "../domain/credits";
import { SUPPORT_URL } from "../config";
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
        <AppHeader user={user} credits={credits} showBack />

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
            <p className="note">
              <a
                href="https://github.com/hashrock/nansuka"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              でソースコードを公開しています。
            </p>
          </section>

          <section>
            <h2>クレジット</h2>
            <p className="credit-balance">{credits.toLocaleString()}</p>
            {/* 残高 0 で翻訳が止まったあと、ここに来て行き止まりになっていた (#4)。
                購入導線はまだ無いので、無いことと相談先を正直に書く。 */}
            {credits <= 0 && (
              <div className="callout" role="status">
                <strong>残高が 0 のため、翻訳とコンテキスト要約は動きません。</strong>
                <p>
                  クレジットの追加購入はまだ用意していません。必要な場合は{" "}
                  <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                    GitHub の Issues
                  </a>{" "}
                  から運営に連絡してください。既に訳した文はそのまま読めます。
                </p>
              </div>
            )}
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
