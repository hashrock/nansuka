# UI テスト用シナリオ

Chrome MCP などでブラウザ操作の UI テストをするとき、毎回手で初期状態を作らずに済むよう、
「URL を開くだけで所定の初期状態が用意され、その画面へ移動する」route を用意している。

| パス | 説明 |
|------|------|
| `GET /__scenarios` | 一覧ページ。名前・説明・リンクと、この環境で使えるかどうかを表示する |
| `GET /__scenarios/:name` | 初期状態を**新規に**作り、テスト対象の画面へ 303 でリダイレクトする |
| `GET /__scenarios/:name?format=json` | リダイレクトせず、作った ID・URL・ログイン状態を JSON で返す。`Accept: application/json` でも同じ |

実装は `app/scenarios/` にまとまっている。シナリオは「何を作るか」の計画 (`build()`) と、
それを D1 に書くランナー (`apply.ts`) に分かれていて、計画は `scenarios.test.ts` で検証している。

## シナリオ一覧

| name | 内容 | 移動先 | 新規ユーザー必須 |
|------|------|--------|:---:|
| `empty` | ノートも履歴も無い初回利用者。`/notes` が最初の空ノートを作って開く | `/notes` | ✔ |
| `typical` | 翻訳済み・翻訳途中 (手直し済みの行あり)・書きかけの 3 ノート | `/notes` (一覧) | |
| `large` | 60 行のノート (2000 文字超の段落、改行入り、折り返せない URL、全角 600 文字) と、一覧に 30 件の長い題名 | 60 行のノート | |
| `custom-prompt` | 校正プロンプトを設定したノート。カラム見出しが「出力」、ボタンが「再生成」になる | そのノート | |
| `no-credits` | 残高 0 のユーザーが未翻訳のノートを開く。翻訳すると残高不足 (402) | そのノート | ✔ |
| `ledger` | 翻訳・要約・失敗による返却が入り混じった 30 件以上の履歴 | `/account` | ✔ |

## 誰のアカウントに作られるか

- **`DEV_BYPASS_AUTH` が有効 (ローカル開発)**: 開くたびに `scenario-<name>-<乱数>` という新規ユーザーを作り、
  署名付きセッション Cookie でそのユーザーとしてログインする。以前の実行や Dev User のデータとは完全に隔離される。
  `/auth/logout` で Cookie を消せば固定の Dev User に戻る。
- **バイパス無効で Google ログイン済み (本番・プレビュー)**: 本人のアカウントにノートを作る。題名は
  `scenario-<name>-<乱数>: ...` で始まるので後から見分けて消せる。残高と台帳には触れない。
  残高を動かすシナリオ (`empty` / `no-credits` / `ledger`) は使えず、一覧に理由が出る。
  `/__scenarios/:name` は一覧へ 303、JSON は 409 を返す。
- **未ログイン**: `/` (ランディング) へ 303。JSON は 401 と `loginUrl` を返す。認証を迂回する経路はない。

既存のデータを消したり書き換えたりすることはなく、毎回新しい ID で作る。
ノートの題名は必ず `scenario-<name>-<乱数>` で始まる。

## Chrome MCP からの使い方

1. 開発サーバを起動する (`pnpm dev`、`.dev.vars` に `DEV_BYPASS_AUTH=1` と `SESSION_SECRET`)。
2. `http://localhost:5173/__scenarios/<name>` に navigate する。初期状態が作られ、対象画面に着く。
3. 作られた ID を辿りたいときは `?format=json` を先に叩く。同じレスポンスで Cookie も付くので、
   その後のページ遷移は JSON の `url` や `notes[].url` を開けばよい。

JSON の形:

```json
{
  "scenario": "typical",
  "label": "scenario-typical-k3x9qa",
  "url": "/notes",
  "user": { "id": "…", "email": "scenario-typical-k3x9qa@scenario.invalid", "fresh": true },
  "credits": 992,
  "notes": [{ "id": "…", "title": "scenario-typical-k3x9qa: 翻訳ツールを作るとき", "url": "/notes/…" }]
}
```

curl で確認する例:

```bash
curl -si http://localhost:5173/__scenarios/typical | head -5          # 303 と Location
curl -s -c /tmp/jar 'http://localhost:5173/__scenarios/large?format=json' | jq .
curl -s -b /tmp/jar -o /dev/null -w '%{http_code}\n' http://localhost:5173/notes
```

## シナリオを足すには

1. `app/scenarios/<name>.ts` に `ScenarioDefinition` を書く。`build(label)` は `ScenarioPlan`
   (ノートの行、台帳、移動先) を返す純粋な関数にする。題名は `label` で始める。
2. `app/scenarios/registry.ts` の `SCENARIOS` に足す (3〜6 個に収める)。
3. 残高を動かす、あるいはノートが無い状態が必要なら `requiresFreshUser: true` にする。
4. `scenarios.test.ts` に固有の検証を 1 つ足し、この一覧を更新する。
