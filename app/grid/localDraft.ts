import { parseRows, rowsFromLegacyInput, serializeRows } from "./rowsCodec";
import type { Row } from "./types";

/** グリッド版がローカル保存に使っていたキー。 */
const ROWS_KEY = "nansuka-rows";
/** さらに前、単一テキストエリア版のキー。 */
const LEGACY_INPUT_KEY = "nansuka-input";

/**
 * ログイン前のバージョンでブラウザに残っている下書きを読む。
 * ノートがサーバー保存になったので、これは取り込み提案のためだけに使う。
 */
export function readLocalDraft(): Row[] | null {
  try {
    const stored = localStorage.getItem(ROWS_KEY);
    if (stored) {
      const rows = parseRows(stored);
      if (rows.some((row) => row.source.trim() || row.translated.trim())) {
        return rows;
      }
    }

    const legacy = localStorage.getItem(LEGACY_INPUT_KEY);
    if (legacy) {
      const rows = rowsFromLegacyInput(JSON.parse(legacy) as string);
      if (rows.some((row) => row.source.trim())) return rows;
    }
  } catch {
    // 壊れていたら「下書きなし」として扱う。
  }
  return null;
}

/**
 * サーバーへの保存に失敗したとき、本文をブラウザに退避する (#2)。
 * ノート一覧が readLocalDraft で拾って「ノートとして取り込む」を勧めるので、
 * ログインが切れても入力は消えない。
 */
export function writeLocalDraft(rows: Row[]): boolean {
  try {
    localStorage.setItem(ROWS_KEY, serializeRows(rows));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft() {
  try {
    localStorage.removeItem(ROWS_KEY);
    localStorage.removeItem(LEGACY_INPUT_KEY);
  } catch {
    // 消せなくても致命的ではない。
  }
}
