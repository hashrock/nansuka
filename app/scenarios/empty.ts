import type { ScenarioDefinition } from "./types";

/**
 * 初回利用者の画面。ノートが 1 つも無いので /notes が最初のノートを作って
 * 開く。その自動作成まで含めて確認したいので、ここではノートを作らない。
 */
export const empty: ScenarioDefinition = {
  name: "empty",
  title: "まっさら",
  description: "ノートも履歴も無い初回利用者。/notes が最初の空ノートを作って開く。",
  requiresFreshUser: true,
  build: () => ({ notes: [], ledger: [], target: { kind: "notes" } }),
};
