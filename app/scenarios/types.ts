import type { Row } from "../grid/types";

/**
 * シナリオは「何を作るか」の計画 (ScenarioPlan) と、それを D1 に書く
 * ランナー (apply.ts) に分ける。計画は純粋な値なので vitest で検証できる。
 */

export type NotePlan = {
  /** 一覧に出る題名。必ずシナリオのラベルで始める。 */
  title: string;
  rows: Row[];
  /** 訳文カラムの指示。null なら既定の翻訳。 */
  prompt?: string | null;
};

/** クレジット台帳に残す出来事。amount は常に正。 */
export type LedgerPlan =
  | { kind: "spend"; amount: number; reason: string; noteIndex?: number }
  | { kind: "grant"; amount: number; reason: string };

/** リダイレクト先。ノートは plan.notes の添字で指す。 */
export type ScenarioTarget =
  | { kind: "notes" }
  | { kind: "note"; index: number }
  | { kind: "account" };

export type ScenarioPlan = {
  notes: NotePlan[];
  ledger: LedgerPlan[];
  target: ScenarioTarget;
};

export type ScenarioDefinition = {
  /** URL に使う名前。英小文字とハイフンのみ。 */
  name: string;
  title: string;
  description: string;
  /**
   * 残高やノート数など、既存アカウントでは再現できない状態を要求する。
   * true のシナリオは新規ユーザーを作れるとき (DEV_BYPASS_AUTH) だけ使える。
   */
  requiresFreshUser: boolean;
  /** label は `scenario-<name>-<rand>`。題名やユーザー名に付ける。 */
  build(label: string): ScenarioPlan;
};
