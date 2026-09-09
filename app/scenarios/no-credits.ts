import { INITIAL_CREDITS } from "../db/schema";
import type { LedgerPlan, ScenarioDefinition } from "./types";
import { EN_ARTICLE, source } from "./text";

/** 残高 0。ヘッダーのバッジが空表示になり、翻訳すると残高不足 (402) になる。 */
export const noCredits: ScenarioDefinition = {
  name: "no-credits",
  title: "クレジット切れ",
  description: "残高 0 のユーザーが未翻訳のノートを開く。翻訳を試みると残高不足になる。",
  requiresFreshUser: true,
  build: (label) => {
    // 初期付与を数回の翻訳で使い切った形にする。
    const ledger: LedgerPlan[] = [];
    let remaining = INITIAL_CREDITS;
    while (remaining > 0) {
      const amount = Math.min(remaining, 300);
      ledger.push({ kind: "spend", amount, reason: "translate", noteIndex: 0 });
      remaining -= amount;
    }
    return {
      notes: [{ title: `${label}: 未翻訳のメール`, rows: EN_ARTICLE.map(source) }],
      ledger,
      target: { kind: "note", index: 0 },
    };
  },
};
