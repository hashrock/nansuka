import type { ScenarioDefinition } from "./types";

/** 初回利用者の画面。ノートが 1 つも無い一覧と URL 取り込み欄を確認する。 */
export const empty: ScenarioDefinition = {
  name: "empty",
  title: "まっさら",
  description: "ノートも履歴も無い初回利用者。/notes は空の一覧と URL 取り込み欄を出す。",
  requiresFreshUser: true,
  build: () => ({ notes: [], ledger: [], target: { kind: "notes" } }),
};
