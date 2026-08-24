/**
 * Excel のクリップボード形式 (TSV) の読み書き。
 *
 * Excel はフィールドにタブ・改行・引用符が含まれるときだけ `"` で囲み、
 * 内側の `"` を `""` に重ねる。囲まれていない `"` はただの文字として扱う。
 */

function escapeField(value: string): string {
  if (!/[\t\n\r"]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function serializeTsv(grid: string[][]): string {
  return grid.map((row) => row.map(escapeField).join("\t")).join("\n");
}

export function parseTsv(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    grid.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // `""` は引用符1文字、単独の `"` は引用終わり。
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // 引用符はフィールド先頭でのみ引用の開始として扱う。
    if (ch === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === "\t") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // 末尾の改行で行を閉じ終えている場合は、空の行を足さない。
  if (field !== "" || row.length > 0) endRow();

  return grid;
}

/** 貼り付けたグリッドを、列数が揃った矩形に整える。 */
export function padGrid(grid: string[][], width: number): string[][] {
  return grid.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });
}
