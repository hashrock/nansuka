/**
 * Excel のクリップボード形式 (TSV) の読み書き。
 *
 * Excel はフィールドにタブ・改行・引用符が含まれるときだけ `"` で囲み、
 * 内側の `"` を `""` に重ねる。囲まれていない `"` はただの文字として扱う。
 *
 * 改行は「行の終端子」であって区切り子ではない。`serializeTsv` は最後の行
 * のうしろにも改行を置き、`parseTsv` は終端子で閉じ終えた後に空行を足さない。
 * こう決めると `[["a"], [""]]` (1列だけの空行が末尾) も `"a\n\n"` と書けて
 * 読み直しで消えず、どんな幅のグリッドでも往復が一致する。Excel も同じ規約で
 * 書き出すので、`"a\tb\n"` は今までどおり1行として読める。
 *
 * 空行を引用符 (`""`) で囲んで区別する手もあるが、`parseClipboard` はタブの
 * 有無で TSV と段落を振り分けるため、空セルをコピーすると `""` という文字列
 * がそのまま貼り付く。終端子方式なら引用符を増やさずに済む。
 */

function escapeField(value: string): string {
  if (!/[\t\n\r"]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function serializeTsv(grid: string[][]): string {
  return grid.map((row) => `${row.map(escapeField).join("\t")}\n`).join("");
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

  // 終端子で閉じ終えている場合は、空の行を足さない。終端子のない入力
  // (末尾に改行を付けない書き出し) も読めるよう、読みかけなら閉じる。
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
 *
 * 1列だけの TSV はタブを含まないので、この振り分けでは文章と区別できない。
 * 外から来たテキストには推測しようがないが、アプリ自身のコピーは
 * `GRID_CLIPBOARD_TYPE` で形式が分かるので推測に頼らない。
 */
export function parseClipboard(text: string): string[][] {
  return /\t/.test(text) ? parseTsv(text) : parseParagraphs(text);
}

/**
 * アプリがコピーしたことを示すクリップボードの型。
 * 同じブラウザ内でしか渡らないので、無ければ text/plain に落とす。
 */
export const GRID_CLIPBOARD_TYPE = "application/x-nansuka-grid";

/**
 * クリップボードからグリッドを読む。
 *
 * 自前の型があれば TSV と分かっているのでそのまま読む。1列のコピーが
 * 段落として解釈され、空行が落ちたり複数行が1セルに潰れたりするのを防ぐ。
 */
export function writeClipboardGrid(
  write: (type: string, data: string) => void,
  grid: string[][],
): void {
  const text = serializeTsv(grid);
  // 他のアプリが読むのは text/plain。先に書いて、確実に載せておく。
  write("text/plain", text);
  try {
    write(GRID_CLIPBOARD_TYPE, text);
  } catch {
    // 独自の型を拒むブラウザでは text/plain だけで動く (推測に戻るだけ)。
  }
}

export function readClipboardGrid(read: (type: string) => string): string[][] {
  const own = read(GRID_CLIPBOARD_TYPE);
  if (own) return parseTsv(own);
  return parseClipboard(read("text/plain"));
}

/** 貼り付けたグリッドを、列数が揃った矩形に整える。 */
export function padGrid(grid: string[][], width: number): string[][] {
  return grid.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });
}
