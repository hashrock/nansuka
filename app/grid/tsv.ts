/**
 * Excel のクリップボード形式 (TSV) の読み書き。
 *
 * Excel はフィールドにタブ・改行・引用符が含まれるときだけ `"` で囲み、
 * 内側の `"` を `""` に重ねる。囲まれていない `"` はただの文字として扱う。
 *
 * 末尾の改行は行区切りなので、1列だけの空行が最後に来るグリッド
 * (`[["a"], [""]]`) はテキストに書き分けられず、読み直すと消える。これは
 * TSV の形式そのものが持つ曖昧さで、直そうとすると空セルのコピーが
 * `""` という文字列になって貼り付く。アプリは常に COL_COUNT 列
 * (行が必ずタブを含む) で扱うため、この曖昧さには踏み込まない。
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
  // 読みかけの行があるか。空文字でも引用符を読んだらフィールドは存在する。
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    grid.push(row);
    row = [];
    started = false;
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
      started = true;
      i += 1;
      continue;
    }
    if (ch === "\t") {
      endField();
      started = true;
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
    started = true;
    i += 1;
  }

  // 末尾の改行で行を閉じ終えている場合は、空の行を足さない。
  if (started) endRow();

  return grid;
}

/**
 * 空行区切りの素のテキストを、段落ごとに 1 行 1 列のグリッドに開く。
 * 段落内の単独改行はそのまま残す。
 */
export function parseParagraphs(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => [p]);
}

/**
 * クリップボードのテキストをグリッドに変換する。
 * タブを含む (Excel などの表からのコピー) なら TSV、
 * それ以外は文章とみなして空行区切りで段落に分ける。
 */
export function parseClipboard(text: string): string[][] {
  return /\t/.test(text) ? parseTsv(text) : parseParagraphs(text);
}

/** 貼り付けたグリッドを、列数が揃った矩形に整える。 */
export function padGrid(grid: string[][], width: number): string[][] {
  return grid.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });
}
