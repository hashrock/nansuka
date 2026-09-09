/**
 * ノート一覧の絞り込み。
 *
 * ユーザテスト (#10) で、30 件を超えると目視スクロールしか手が無かった。
 * 検索機能を丸ごと作るのではなく、題名の部分一致 1 つだけを置く。
 * 大文字小文字と前後の空白は無視する。
 */
export function filterNotesByTitle<T extends { title: string }>(
  notes: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [...notes];
  return notes.filter((note) => note.title.toLocaleLowerCase().includes(needle));
}
