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
                    静的アセット配信
                    (Cloudflare Assets)
```

- **構成**: Hono + Inertia.js + React 19 の単一アプリ（サーバー・クライアント分離なし）
- **ランタイム**: Cloudflare Workers 上で Hono がページ配信と JSON API の両方を担当
- **ページ配信**: Inertia.js（`app/pages/` の React コンポーネントを SSR ドキュメント経由で配信）
- **AI Gateway**: Cloudflare AI Gateway 経由で Anthropic API にアクセス（レート制限・ログ・キャッシュ等）
- **モデル**: Claude Haiku 4.5 (`claude-haiku-4-5`)
- **デプロイ**: GitHub Actions で main/dev ブランチへの push 時に自動デプロイ
- **ステージング**: https://nansuka-staging.hashrock.workers.dev/ （dev ブランチから自動デプロイ）

### API エンドポイント

| パス | メソッド | 説明 |
|------|----------|------|
| `/translate` | POST | 段落の一括翻訳 |
| `/context` | POST | テキストのコンテキスト要約 |
| その他 | - | 静的アセット配信 |

### シークレット管理

- `CF_AIG_TOKEN`: AI Gateway のアクセストークン（`wrangler secret put` で設定）
- Anthropic API キーは AI Gateway のダッシュボードで設定

## プロジェクト構成

リポジトリ直下に単一アプリを置く構成です。

```
app/
  server.ts        # Hono エントリ（JSON API + Inertia ページ配信）
  root-view.tsx    # Inertia の SSR ドキュメント
  client.tsx       # クライアントエントリ（createInertiaApp）
  pages/           # Inertia ページコンポーネント
  domain.ts        # 翻訳・要約のドメインロジック
  *.ts             # フック / ユーティリティ
public/            # 静的アセット
vite.config.ts
wrangler.jsonc
```

JSX は `@vitejs/plugin-react` ではなく tsconfig の `jsx: react-jsx` により esbuild で変換しています
（Fast Refresh の preamble が Inertia の独自 SSR ドキュメントに注入されず hydration が壊れるため）。

## 開発

```bash
pnpm install
cp .dev.vars.example .dev.vars   # CF_AIG_TOKEN を設定
pnpm dev
```

`pnpm dev` は Vite + Cloudflare プラグインで Worker ごとローカル起動します（http://localhost:5173）。

## ビルド・デプロイ

```bash
pnpm build               # ビルド
pnpm preview             # ビルド + ローカルプレビュー
pnpm deploy              # ビルド + 本番デプロイ
pnpm deploy:staging      # ビルド + ステージングデプロイ
```

- `main` ブランチに push → 本番に自動デプロイ
- `dev` ブランチに push → ステージング (https://nansuka-staging.hashrock.workers.dev/) に自動デプロイ
- PR 作成時 → プレビュー環境に自動デプロイ

## 技術スタック

- Hono / Inertia.js
- React 19 / TypeScript
- Vite
- Cloudflare Workers
- Cloudflare AI Gateway
- Anthropic Claude API (claude-haiku-4-5)
