import { PROMPT_PRESETS } from "../domain/prompt";
import type { ScenarioDefinition } from "./types";
import { overridden, source, translated } from "./text";

/** 独自プロンプト (校正)。見出しが「訳文」ではなく「出力」「再生成」に変わる。 */
export const customPrompt: ScenarioDefinition = {
  name: "custom-prompt",
  title: "独自プロンプト",
  description: "校正プロンプトを設定したノート。訳文カラムが「出力」になり、再生成ボタンの文言も変わる。",
  requiresFreshUser: false,
  build: (label) => ({
    notes: [
      {
        title: `${label}: 校正`,
        prompt: PROMPT_PRESETS[0].prompt,
        rows: [
          translated(
            "この文章は、誤字脱字が含まれてます。校正の対象になりますです。",
            "この文章には、誤字脱字が含まれています。校正の対象になります。",
          ),
          overridden(
            "きのう会議で話た内容を、まとめました。",
            "昨日の会議で話した内容をまとめました。",
          ),
          source("あしたは、はれるといいなあとおもいます"),
          source(""),
        ],
      },
    ],
    ledger: [{ kind: "spend", amount: 2, reason: "translate", noteIndex: 0 }],
    target: { kind: "note", index: 0 },
  }),
};
