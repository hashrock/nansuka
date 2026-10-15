import { extractArticle } from "./domain/article";
import { parseParagraphs } from "./grid/tsv";

/** 読み込むページの上限。これを超えた分は捨てる (記事本文には十分)。 */
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
/** 1 ノートに取り込む段落の上限。巨大なページで行が数千になるのを防ぐ。 */
export const MAX_PARAGRAPHS = 300;

export type ImportErrorCode = "invalid-url" | "fetch" | "unsupported" | "empty";

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(code);
    this.code = code;
  }
}

/**
 * 公開された Web ページとは思えない宛先。利用者が渡した URL をサーバーから
 * 取りに行くので、内部向けのホストを叩かせる SSRF の踏み台にならないよう弾く。
 *
 * Workers の fetch は Cloudflare のエッジから出ていくので、もともと社内網や
 * メタデータ API のような内側は無いが、`wrangler dev` では手元のマシンから
 * 出ていく。記事を IP アドレスで読む人はいないので、IP 直打ちごと断る。
 * (URL のパーサーが `0x7f.1` や `2130706433` も `127.0.0.1` に正規化する。)
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    !host.includes(".") ||
    host.startsWith("[") ||
    /^[\d.]+$/.test(host) ||
    /\.(localhost|local|internal|intranet|lan|home\.arpa)$/.test(host)
  );
}

/** http(s) の絶対 URL だけを受け付ける。スキーム省略は https とみなす。 */
export function parseImportUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb && !url.username && !url.password && !isPrivateHost(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

/** リダイレクトは自分で追い、行き先ごとに parseImportUrl を通し直す。 */
async function fetchPublic(url: URL): Promise<Response> {
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.1", "User-Agent": "Nansuka/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel();
    const next = parseImportUrl(new URL(location, url).href);
    if (!next) throw new ImportError("invalid-url");
    url = next;
  }
  throw new ImportError("fetch");
}

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer());
}

/**
 * 文字コードはヘッダー、無ければ先頭の <meta charset> から決める。
 * Shift_JIS の日本語サイトはヘッダーに charset を書かないことが多い。
 */
function decode(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const charset =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export async function fetchArticle(input: string): Promise<string[]> {
  const url = parseImportUrl(input);
  if (!url) throw new ImportError("invalid-url");

  let res: Response;
  try {
    res = await fetchPublic(url);
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError("fetch");
  }
  if (!res.ok) throw new ImportError("fetch");

  const type = res.headers.get("content-type") ?? "";
  const isHtml = /html|xml/i.test(type);
  if (!isHtml && !/^text\//i.test(type)) throw new ImportError("unsupported");

  const body = decode(await readCapped(res), type);
  // 素のテキスト (text/plain や Markdown) は貼り付けと同じく空行区切りで段落にする。
  const paragraphs = (isHtml ? extractArticle(body) : parseParagraphs(body).map(([p]) => p))
    .slice(0, MAX_PARAGRAPHS);
  if (paragraphs.length === 0) throw new ImportError("empty");
  return paragraphs;
}
