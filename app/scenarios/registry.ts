import type { SessionUser } from "../user";
import type { ScenarioDefinition } from "./types";
import { empty } from "./empty";
import { typical } from "./typical";
import { large } from "./large";
import { customPrompt } from "./custom-prompt";
import { noCredits } from "./no-credits";
import { ledger } from "./ledger";

export const SCENARIOS: readonly ScenarioDefinition[] = [
  empty,
  typical,
  large,
  customPrompt,
  noCredits,
  ledger,
];

export function findScenario(name: string): ScenarioDefinition | undefined {
  return SCENARIOS.find((s) => s.name === name);
}

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const SUFFIX_LENGTH = 6;

/** 実行ごとのデータを見分けるための短い乱数。衝突しても困らない用途。 */
export function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
  return Array.from(bytes, (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}

export function scenarioLabel(name: string, suffix: string): string {
  return `scenario-${name}-${suffix}`;
}

/** ?format=json か Accept: application/json なら JSON で返す。 */
export function wantsJson(format: string | undefined, accept: string | undefined): boolean {
  if (format === "json") return true;
  return (accept ?? "").split(",").some((part) => part.trim().startsWith("application/json"));
}

/**
 * 誰のアカウントにデータを作るか。
 * - bypass 有効: 毎回新規ユーザーを作る。既存データと完全に隔離できる。
 * - bypass 無効でログイン済み: 本人のアカウントに作る。残高を動かす
 *   シナリオは本人のデータを書き換えることになるので使わせない。
 * - 未ログイン: 通常の認証フローへ送る。
 */
export type Actor =
  | { kind: "fresh" }
  | { kind: "own"; user: SessionUser }
  | { kind: "login-required" }
  | { kind: "unavailable"; reason: string };

export const FRESH_USER_REASON =
  "新規ユーザーが必要なシナリオです。DEV_BYPASS_AUTH を有効にした環境でだけ使えます。";

export function resolveActor(
  scenario: ScenarioDefinition,
  bypass: boolean,
  user: SessionUser | null,
): Actor {
  if (bypass) return { kind: "fresh" };
  if (!user) return { kind: "login-required" };
  if (scenario.requiresFreshUser) return { kind: "unavailable", reason: FRESH_USER_REASON };
  return { kind: "own", user };
}
