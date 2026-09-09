import type { ScenarioDefinition } from "./types";
import { JA_ARTICLE, JA_TRANSLATIONS, longParagraph, source, translated } from "./text";

export const LARGE_ROW_COUNT = 60;
export const LARGE_LIST_COUNT = 30;
export const LONG_PARAGRAPH_LENGTH = 2000;

/** レイアウトが崩れやすい状態。長文・多行・改行入り・折り返せない文字列を混ぜる。 */
export const large: ScenarioDefinition = {
  name: "large",
  title: "大量・長文",
  description: `${LARGE_ROW_COUNT} 行のノート (${LONG_PARAGRAPH_LENGTH} 文字超の段落や改行入りを含む) と、一覧に ${LARGE_LIST_COUNT} 件の長い題名。`,
  requiresFreshUser: false,
  build: (label) => {
    const rows = [
      translated(
        longParagraph(JA_ARTICLE[1], LONG_PARAGRAPH_LENGTH),
        longParagraph(JA_TRANSLATIONS[1], LONG_PARAGRAPH_LENGTH),
      ),
      source(longParagraph(JA_TRANSLATIONS[2] + " ", LONG_PARAGRAPH_LENGTH)),
      source("箇条書き\n- 一つ目\n- 二つ目\n- 三つ目\n\n段落内の空行のあとに続く文。"),
      source(`https://example.com/${"very-long-path-segment-".repeat(12)}end`),
      source("あ".repeat(600)),
    ];
    for (let i = rows.length; i < LARGE_ROW_COUNT; i++) {
      const text = JA_ARTICLE[i % JA_ARTICLE.length];
      rows.push(
        i % 3 === 0 ? source(`${i + 1}. ${text}`) : translated(`${i + 1}. ${text}`, JA_TRANSLATIONS[i % JA_TRANSLATIONS.length]),
      );
    }

    const notes = [{ title: `${label}: ${LARGE_ROW_COUNT} 行のノート`, rows }];
    for (let i = 0; i < LARGE_LIST_COUNT; i++) {
      notes.push({
        title: `${label}: #${String(i + 1).padStart(2, "0")} ${longParagraph(JA_ARTICLE[i % JA_ARTICLE.length], 120)}`,
        rows: [source(JA_ARTICLE[i % JA_ARTICLE.length])],
      });
    }

    return {
      notes,
      ledger: [{ kind: "spend", amount: 40, reason: "translate", noteIndex: 0 }],
      target: { kind: "note", index: 0 },
    };
  },
};
