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
