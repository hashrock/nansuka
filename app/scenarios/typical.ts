import type { ScenarioDefinition } from "./types";
import {
  EN_ARTICLE,
  EN_TRANSLATIONS,
  JA_ARTICLE,
  JA_TRANSLATIONS,
  overridden,
  source,
  translated,
} from "./text";

/** ふつうに使い込んだ状態。訳し終えたもの、途中のもの、書きかけのものが並ぶ。 */
export const typical: ScenarioDefinition = {
  name: "typical",
  title: "ふつうの利用状態",
  description: "翻訳済み・翻訳途中・書きかけの 3 ノート。ノート一覧を開く。",
  requiresFreshUser: false,
  build: (label) => ({
    notes: [
      {
        title: `${label}: 翻訳ツールを作るとき`,
        rows: JA_ARTICLE.map((text, i) => translated(text, JA_TRANSLATIONS[i])),
      },
      {
        title: `${label}: Thank you for reaching out`,
        rows: [
          translated(EN_ARTICLE[0], EN_TRANSLATIONS[0]),
          overridden(EN_ARTICLE[1], "レイアウトの問題が片付いていれば、来週火曜にベータ版を出します。"),
          source(EN_ARTICLE[2]),
          source(EN_ARTICLE[3]),
        ],
      },
      {
        title: `${label}: 会議メモ`,
        rows: [source("会議メモ 9/9"), source("次回までにベータ版の翻訳文言を確認する")],
      },
    ],
    ledger: [
      { kind: "spend", amount: 5, reason: "translate", noteIndex: 0 },
      { kind: "spend", amount: 1, reason: "context", noteIndex: 0 },
      { kind: "spend", amount: 2, reason: "translate", noteIndex: 1 },
    ],
    target: { kind: "notes" },
  }),
};
