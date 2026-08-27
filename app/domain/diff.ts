/**
 * 校正用途で「どこを直したか」を見せるための、文字単位の差分。
 * 段落 1 つ分の短いテキストが前提なので、素朴な LCS で十分。
 */

export type DiffSegment = { type: "same" | "ins" | "del"; text: string };

/** これより長いと DP 表が重いので差分を諦めてそのまま返す。 */
export const DIFF_MAX_LENGTH = 1200;

/** 空白と句読点の違いだけの段を潰して、読みやすい塊にする。 */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

/**
 * `before` を `after` にする差分。`after` の視点で描画する想定なので
 * 削除は位置だけ分かればよい (文字は残す)。
 */
export function diffChars(before: string, after: string): DiffSegment[] {
  if (before === after) return after ? [{ type: "same", text: after }] : [];
  if (
    !before ||
    !after ||
    before.length > DIFF_MAX_LENGTH ||
    after.length > DIFF_MAX_LENGTH
  ) {
    return [
      ...(before ? [{ type: "del" as const, text: before }] : []),
      ...(after ? [{ type: "ins" as const, text: after }] : []),
    ];
  }

  const a = Array.from(before);
  const b = Array.from(after);
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = a[i..] と b[j..] の LCS 長。後ろから埋める。
  const lcs: Uint16Array[] = Array.from(
    { length: n + 1 },
    () => new Uint16Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      segments.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      segments.push({ type: "del", text: a[i] });
      i++;
    } else {
      segments.push({ type: "ins", text: b[j] });
      j++;
    }
  }
  while (i < n) segments.push({ type: "del", text: a[i++] });
  while (j < m) segments.push({ type: "ins", text: b[j++] });

  return mergeSegments(segments);
}
