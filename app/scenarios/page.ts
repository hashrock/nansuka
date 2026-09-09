import type { SessionUser } from "../user";
import type { Actor } from "./registry";
import type { ScenarioDefinition } from "./types";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type Item = ScenarioDefinition & { actor: Actor };

/** 一覧ページ。Inertia を通さない素の HTML にして、アプリ本体の状態に依存させない。 */
export function renderIndex({
  scenarios,
  bypass,
  user,
  unavailable,
}: {
  scenarios: Item[];
  bypass: boolean;
  user: SessionUser | null;
  unavailable: string | null;
}): string {
  const status = bypass
    ? "DEV_BYPASS_AUTH が有効です。シナリオごとに新規ユーザーを作り、そのユーザーでログインします。"
    : user
      ? `${escapeHtml(user.email)} としてログイン中です。ノートはこのアカウントに作られます。残高を動かすシナリオは使えません。`
      : '未ログインです。シナリオを開くとランディングへ送られます。<a href="/auth/google">Google でログイン</a>してから使ってください。';

  const notice = unavailable
    ? `<p class="notice">「${escapeHtml(unavailable)}」はこの環境では使えません。下の一覧の理由を確認してください。</p>`
    : "";

  const items = scenarios
    .map((s) => {
      const usable = s.actor.kind === "fresh" || s.actor.kind === "own";
      const reason =
        s.actor.kind === "unavailable"
          ? `<p class="reason">${escapeHtml(s.actor.reason)}</p>`
          : s.actor.kind === "login-required"
            ? '<p class="reason">ログインが必要です。</p>'
            : "";
      const link = usable
        ? `<a href="/__scenarios/${s.name}">/__scenarios/${s.name}</a>`
        : `<span class="disabled">/__scenarios/${s.name}</span>`;
      return `<li>
  <h2>${escapeHtml(s.title)} <code>${escapeHtml(s.name)}</code></h2>
  <p>${escapeHtml(s.description)}</p>
  <p>${link} · <a href="/__scenarios/${s.name}?format=json">JSON</a></p>
  ${reason}
</li>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI テスト用シナリオ - Nansuka</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin: 0 0 .25rem; }
  code { background: #f2f2f2; padding: 0 .3em; border-radius: 3px; font-size: .9em; }
  ul { list-style: none; padding: 0; }
  li { border: 1px solid #ddd; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
  li p { margin: .25rem 0; }
  .status, .notice { padding: .75rem 1rem; border-radius: 6px; background: #eef4ff; }
  .notice { background: #fff3e0; }
  .reason { color: #a33; }
  .disabled { color: #999; }
</style>
</head>
<body>
<h1>UI テスト用シナリオ</h1>
<p>リンクを開くと初期状態を<strong>新規に</strong>作ってその画面へ移動します。既存のデータは変更しません。</p>
<p class="status">${status}</p>
${notice}
<ul>
${items}
</ul>
<p>使い方: <a href="https://github.com/hashrock/nansuka/blob/main/docs/ui-test-scenarios.md">docs/ui-test-scenarios.md</a></p>
</body>
</html>`;
}
