import type { LedgerPlan, ScenarioDefinition } from "./types";
import { JA_ARTICLE, source } from "./text";

export const LEDGER_ENTRY_COUNT = 30;

/** 履歴が多いアカウント画面。消費・要約・返却が入り混じる。 */
export const ledger: ScenarioDefinition = {
  name: "ledger",
  title: "クレジット履歴が多い",
  description: `${LEDGER_ENTRY_COUNT} 件以上の増減 (翻訳・要約・失敗による返却) があるアカウント画面。`,
  requiresFreshUser: true,
  build: (label) => {
    const entries: LedgerPlan[] = [];
    for (let i = 0; i < LEDGER_ENTRY_COUNT; i++) {
      switch (i % 5) {
        case 3:
          entries.push({ kind: "spend", amount: 1, reason: "context", noteIndex: 0 });
          break;
        case 4:
          entries.push({ kind: "spend", amount: 12, reason: "translate", noteIndex: 0 });
          entries.push({ kind: "grant", amount: 12, reason: "translate:refund" });
          break;
        default:
          entries.push({ kind: "spend", amount: 3 + (i % 4), reason: "translate", noteIndex: 0 });
      }
    }
    return {
      notes: [{ title: `${label}: 翻訳ツールを作るとき`, rows: JA_ARTICLE.map(source) }],
      ledger: entries,
      target: { kind: "account" },
    };
  },
};
