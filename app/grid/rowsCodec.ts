import { createRow, rowsFromText, type Row } from "./types";

/**
 * ノートの content (JSON文字列) と行の相互変換。
 *
 * 保存先がサーバーになったぶん、壊れた・古い形のデータが来る可能性がある。
 * 読み込みは常に「必ず1行以上のグリッド」を返すことにして、呼び出し側が
 * 空配列を気にしなくて済むようにする。
 */
export function parseRows(content: string): Row[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [createRow()];
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return [createRow()];

  const rows = parsed
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : createRow().id,
      source: typeof row.source === "string" ? row.source : "",
      translated: typeof row.translated === "string" ? row.translated : "",
      overridden: Boolean(row.overridden),
    }));

  return rows.length > 0 ? rows : [createRow()];
}

export function serializeRows(rows: Row[]): string {
  return JSON.stringify(rows);
}

/** 旧・単一テキストエリア版の保存値 (空行区切りの文字列) を行に開く。 */
export function rowsFromLegacyInput(input: string): Row[] {
  const rows = rowsFromText(input);
  return rows.length > 0 ? rows : [createRow()];
}
