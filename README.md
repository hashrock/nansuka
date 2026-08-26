# Nansuka

シンプルな和英・英和翻訳ツール。

<img width="1046" height="668" alt="CleanShot 2025-11-27 at 22 10 31" src="https://github.com/user-attachments/assets/ab9072ab-69b6-4c60-a5a8-3672a3aadbb6" />

## 機能

- 日本語/英語を自動判定して翻訳
- 段落ごとに個別に翻訳（変更があった部分のみ再翻訳）
- 翻訳結果のコピー・訳し直し機能
- コンテキスト自動要約による翻訳精度の向上

## システム構成

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐     ┌─────────────┐
│  ブラウザ    │────▶│  Cloudflare Workers  │────▶│  CF AI Gateway      │────▶│  Anthropic  │
│  (React)    │◀────│  (Hono + Inertia)    │◀────│  (プロキシ/ログ)     │◀────│  Claude API │
└─────────────┘     └──────────────────────┘     └─────────────────────┘     └─────────────┘
                           │
                      ┌────┴────┐
                      │   D1    │  ユーザー / ノート / クレジット台帳
                      └─────────┘
```

- **構成**: Hono + Inertia.js + React 19 の単一アプリ（サーバー・クライアント分離なし）
- **ページ配信**: Inertia.js（`app/pages/` の React コンポーネントを SSR ドキュメント経由で配信）
- **データ**: Cloudflare D1 + Drizzle ORM。スキーマは `app/db/schema.ts`、マイグレーションは `migrations/`
- **ログイン**: Google OAuth。セッションは HMAC 署名した Cookie に載せる（サーバー側にセッション表を持たない）
- **AI Gateway**: Cloudflare AI Gateway 経由で Anthropic API にアクセス（レート制限・ログ・キャッシュ等）
- **モデル**: Claude Haiku 4.5 (`claude-haiku-4-5`)
- **デプロイ**: GitHub Actions で main ブランチへの push 時に自動デプロイ

## クレジット

翻訳はクレジットを消費します。金額はまだ暫定で、`app/domain/credits.ts` に集約しています。

| 対象 | 単価 |
|------|------|
| 翻訳 | 段落ごとに 200 文字で 1 クレジット（切り上げ） |
| コンテキスト要約 | 1000 文字で 1 クレジット（切り上げ） |
| 新規登録時の付与 | 1000 クレジット |

残高の引き算は `UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?` の1文で行います。
読んでから書く形だと、翻訳リクエストが並列に飛んだときに残高チェックをすり抜けてマイナスになりえます。
増減はすべて `credit_ledger` に残り、アカウントページで確認できます。
API 呼び出しが失敗した場合は同額を返却します。

### 主なルート

| パス | メソッド | 説明 |
|------|----------|------|
| `/` | GET | 未ログインはランディング、ログイン済みは `/notes` へ |
| `/auth/google` | GET | Google OAuth |
| `/auth/logout` | GET | ログアウト |
| `/notes` | GET / POST | ノート一覧 / 新規作成 |
| `/notes/:id` | GET | グリッド（翻訳画面） |
| `/notes/:id/delete` | POST | 削除 |
| `/account` | GET | アカウントとクレジット履歴 |
| `/api/notes/:id` | PUT | グリッドのオートセーブ |
| `/translate` | POST | 段落の一括翻訳（クレジット消費） |
| `/context` | POST | テキストのコンテキスト要約（クレジット消費） |

他人のノートは「見つからない」と同じ扱い（404 / リダイレクト）にして、存在の有無が漏れないようにしています。

### シークレット管理

`wrangler secret put <NAME>` で設定します。

- `CF_AIG_TOKEN`: AI Gateway のアクセストークン
- `SESSION_SECRET`: セッション Cookie の署名鍵（`openssl rand -hex 32` などで生成）
- `GOOGLE_ID` / `GOOGLE_SECRET`: Google OAuth クライアント

Anthropic API キーは AI Gateway のダッシュボードで設定します。

## プロジェクト構成

リポジトリ直下に単一アプリを置く構成です。

```
app/
  server.ts        # Hono エントリ（認証・ノート・翻訳API・Inertiaページ）
  root-view.tsx    # Inertia の SSR ドキュメント
  client.tsx       # クライアントエントリ
  pages/           # Inertia ページ (Landing / Notes/Index / Translate / Account)
  grid/            # 2カラムグリッド（選択・編集・TSV・Undo）
  db/              # Drizzle スキーマと D1 アクセス
  domain/          # 純粋ロジック（クレジット単価、ノートタイトル）
  utils/session.ts # HMAC 署名セッション Cookie
migrations/        # D1 マイグレーション
public/            # 静的アセット
```

JSX は `@vitejs/plugin-react` ではなく tsconfig の `jsx: react-jsx` により esbuild で変換しています
（Fast Refresh の preamble が Inertia の独自 SSR ドキュメントに注入されず hydration が壊れるため）。

## テスト

```bash
pnpm test
```

グリッドの TSV コーデック・選択範囲の計算・行操作と、クレジット単価・ノートタイトルの
純粋ロジックを対象にしています。

## 開発

```bash
pnpm install
cp .dev.vars.example .dev.vars   # CF_AIG_TOKEN と SESSION_SECRET を設定
pnpm migrate                     # ローカル D1 にマイグレーションを適用
pnpm dev
```

`.dev.vars` に `DEV_BYPASS_AUTH=1` を入れておくと、Google の OAuth クライアントがなくても
固定の Dev User でログイン済みとして動きます（本番では絶対に設定しない）。

### データベース

```bash
pnpm generate         # schema.ts からマイグレーションを生成
pnpm migrate          # ローカルに適用
pnpm migrate:remote   # 本番に適用
```

## ビルド・デプロイ

```bash
pnpm build               # ビルド
pnpm preview             # ビルド + ローカルプレビュー
pnpm deploy              # ビルド + 本番デプロイ
```

- `main` ブランチに push → 本番に自動デプロイ
- PR 作成時 → プレビュー環境 (`nansuka-preview-pr-<番号>`) に自動デプロイ、クローズ時に自動削除

ブランチは `main` 一本です。変更はトピックブランチを切って PR にし、プレビュー環境で確認してからマージします。

## 技術スタック

- Hono / Inertia.js
- React 19 / TypeScript
- Vite
- Cloudflare Workers / D1
- Drizzle ORM
- Cloudflare AI Gateway
- Anthropic Claude API (claude-haiku-4-5)
