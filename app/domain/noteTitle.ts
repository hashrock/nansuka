const MAX_TITLE_LENGTH = 40;
export const DEFAULT_NOTE_TITLE = "Untitled";

/**
 * ノートのタイトルは別入力を持たせず、原文の1行目から作る。
 * 翻訳の下書きに毎回名前を付けさせるのは手間のわりに得るものが少ない。
 */
export function deriveNoteTitle(sources: string[]): string {
  const first = sources.map((s) => s.trim()).find((s) => s.length > 0);
  if (!first) return DEFAULT_NOTE_TITLE;

  const singleLine = first.replace(/\s+/g, " ");
  return singleLine.length > MAX_TITLE_LENGTH
    ? `${singleLine.slice(0, MAX_TITLE_LENGTH)}…`
    : singleLine;
}
