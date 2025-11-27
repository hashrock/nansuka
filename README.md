# Nansuka

シンプルな和英・英和翻訳ツール。Claude APIを使用してブラウザ上で動作します。

## 機能

- 日本語/英語を自動判定して翻訳
- 段落ごとに個別に翻訳（変更があった部分のみ再翻訳）
- APIキーはlocalStorageに保存（クライアントのみで動作）
- 翻訳結果のコピー・訳し直し機能

## 使い方

1. Settingsボタンをクリック
2. Claude APIキーを入力
3. 左のテキストエリアにテキストを入力
4. 1秒後に自動で翻訳が右側に表示されます

段落は空行（改行2つ）で区切られます。

## 開発

```bash
pnpm install
pnpm run dev
```

## ビルド

```bash
pnpm run build
```

## デプロイ

mainブランチにpushすると、GitHub Actionsで自動的にGitHub Pagesにデプロイされます。

## 技術スタック

- React 19
- TypeScript
- Vite
- Claude API (claude-haiku-4-5)
