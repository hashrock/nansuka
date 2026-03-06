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
│  (React)    │◀────│  (API サーバー)       │◀────│  (プロキシ/ログ)     │◀────│  Claude API │
└─────────────┘     └──────────────────────┘     └─────────────────────┘     └─────────────┘
                           │
                    静的アセット配信
                    (Cloudflare Assets)
```

- **フロントエンド**: React 19 + TypeScript + Vite でビルドした SPA
- **バックエンド**: Cloudflare Workers (`packages/server/`) で API を提供
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

pnpm workspace による monorepo 構成です。

```
packages/
  client/   # React フロントエンド (Vite)
  server/   # Cloudflare Workers バックエンド
```

## 開発

```bash
pnpm install

# フロントエンド（別ターミナルで）
pnpm dev

# バックエンド
pnpm dev:server
```

開発時は Vite の proxy 設定により `localhost:5173/api/*` が `localhost:8787/*` に転送されます。

## ビルド・デプロイ

```bash
pnpm build               # フロントエンドビルド
pnpm deploy              # ビルド + 本番デプロイ
pnpm deploy:staging      # ビルド + ステージングデプロイ
```

- `main` ブランチに push → 本番に自動デプロイ
- `dev` ブランチに push → ステージング (https://nansuka-staging.hashrock.workers.dev/) に自動デプロイ
- PR 作成時 → プレビュー環境に自動デプロイ

## 技術スタック

- React 19 / TypeScript
- Vite (rolldown-vite)
- Cloudflare Workers
- Cloudflare AI Gateway
- Anthropic Claude API (claude-haiku-4-5)
