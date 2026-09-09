import { translationCost } from "../domain/credits";
import type { Row } from "./types";

/**
 * これを超える自動翻訳は即実行せず、ユーザーの確認を待つ。
 * 誤った貼り付けで大量の段落がそのまま翻訳されてクレジットが飛ぶのを防ぐ。
 */
export const BULK_ROWS = 10;
export const BULK_COST = 20;

/** 原文があり、訳文が空で、手動編集もされていない行が翻訳対象。 */
export function needsTranslation(row: Row): boolean {
  return row.source.trim() !== "" && row.translated === "" && !row.overridden;
}

/**
 * 同じ原文で何度も失敗し続けないよう、試行済みを id + 原文で覚える。
 * 区切りは NUL。原文に何が入っていても別の行のキーと衝突しない。
 */
export function attemptKey(row: Row): string {
  return `${row.id}\0${row.source}`;
}

/**
 * まだ試していない翻訳対象を拾う。
 *
 * 拾った行の attemptKey を attempted に入れてから呼び直すと必ず空になる
 * (これが崩れると自動翻訳が同じ行を回し続ける)。
 */
export function pendingTargets(
  rows: readonly Row[],
  attempted: ReadonlySet<string>,
): Row[] {
  return rows.filter(
    (row) => needsTranslation(row) && !attempted.has(attemptKey(row)),
  );
}

/** 確認ダイアログに出す内訳。 */
export interface BulkConfirmation {
  count: number;
  cost: number;
}

/**
 * 確認ダイアログに出す件数と費用。確認不要なら null。
 * 明示的な再翻訳 (forced) は行数を見せたうえで頼まれているので確認しない。
 */
export function bulkConfirmation(
  targets: readonly Row[],
  forced: ReadonlySet<string>,
): BulkConfirmation | null {
  if (targets.length === 0) return null;
  const cost = translationCost(targets.map((row) => row.source));
  const unforced = targets.some((row) => !forced.has(row.id));
  if (!unforced) return null;
  return targets.length > BULK_ROWS || cost > BULK_COST
    ? { count: targets.length, cost }
    : null;
}

/**
 * 訳文が空のまま止まっている行。自動翻訳がもう拾わない (試行済み、確認を見送った、
 * あるいは自動翻訳そのものが切られている) ので、利用者が明示的に頼まないと
 * 空欄のままになる。ツールバーの「未翻訳の N 行を翻訳」に使う。
 *
 * ユーザテスト (#9) で、空欄が 22 行あるのに「再翻訳」は選択中の 1 行しか
 * 訳さず、全部を埋める手段が見つからなかった。
 */
export function stalledTargets(
  rows: readonly Row[],
  attempted: ReadonlySet<string>,
  translating: ReadonlySet<string>,
  autoTranslate: boolean,
): Row[] {
  return rows.filter(
    (row) =>
      needsTranslation(row) &&
      !translating.has(row.id) &&
      (!autoTranslate || attempted.has(attemptKey(row))),
  );
}

/**
 * ツールバーの翻訳ボタンの文言。選択中の行に訳文の無い行があれば「翻訳」、
 * 全部に訳文があれば「再翻訳」(独自プロンプト時は「生成」「再生成」)。
 *
 * ユーザテスト (#1) で、初めて使う人が「再翻訳」しか無いボタンを
 * 「まだ一度も訳していないのに押してよいのか」と迷った。
 */
export function translateButtonLabel(
  rows: readonly Row[],
  range: { top: number; bottom: number },
  regenerateLabel: string,
): string {
  const selected = rows.slice(range.top, range.bottom + 1);
  const hasUntranslated = selected.some(
    (row) => row.source.trim() !== "" && row.translated === "",
  );
  // まだ何も訳されていない (空のノートも含む) なら「再」は付けない。
  const anyTranslated = selected.some((row) => row.translated !== "");
  if (anyTranslated && !hasUntranslated) return regenerateLabel;
  return regenerateLabel.startsWith("再") ? regenerateLabel.slice(1) : regenerateLabel;
}
