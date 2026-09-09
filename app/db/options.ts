/**
 * 書き込み関数に渡せる省略可能な時刻と ID。
 * 省略すれば現在時刻と乱数 ID。テストやシナリオでは固定して、並び順と
 * 台帳の順序を決定的にする。
 */
export type WriteOptions = {
  /** ISO 8601 文字列。 */
  now?: string;
  id?: string;
};

export function nowIso(options?: WriteOptions): string {
  return options?.now ?? new Date().toISOString();
}

export function newId(options?: WriteOptions): string {
  return options?.id ?? crypto.randomUUID();
}
