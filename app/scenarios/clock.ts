/**
 * シナリオが作るデータの時刻。実時刻を使うと一覧の並びや台帳の順序が
 * 実行ごとに揺れてスクリーンショット比較が安定しないので、固定の起点から
 * 1 分刻みで振る。
 */
export const SCENARIO_EPOCH = "2026-09-01T00:00:00.000Z";
const STEP_MS = 60_000;

export type ScenarioClock = {
  /** 起点から step 分後。 */
  at(step: number): string;
  /** 呼ぶたびに 1 分進む。台帳のように順番が意味を持つものに使う。 */
  next(): string;
};

export function scenarioClock(epoch = SCENARIO_EPOCH): ScenarioClock {
  const base = Date.parse(epoch);
  let cursor = 0;
  return {
    at: (step) => new Date(base + step * STEP_MS).toISOString(),
    next: () => new Date(base + cursor++ * STEP_MS).toISOString(),
  };
}

/**
 * ノートは plan の先頭ほど新しく見せたいので、後ろのノートから順に古い時刻を
 * 振る。一覧は updatedAt の降順なので、これで plan の順に並ぶ。
 */
export function noteTimestamp(clock: ScenarioClock, index: number, total: number): string {
  return clock.at(total - index);
}
