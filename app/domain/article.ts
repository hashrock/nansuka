/**
 * Web ページの HTML から、対訳で読むための段落を取り出す。
 *
 * 「英語の記事を段落ごとに並べて読む」は ChatGPT に貼るより表の方が向いている
 * 使い方なので、URL を渡すだけでノートにできるようにする。厳密な本文抽出は
 * 狙わず、article / main があればそこに絞り、ナビやスクリプトを落として
 * ブロック要素の境目で段落に割るだけにしている。
 */

/** 本文ではない要素。中身ごと捨てる。ページ全体を相手にするときはサイト共通の
 * <header> も落とす (記事の中の <header> には見出しが入っていることが多い)。 */
const DROP_TAGS = "script|style|noscript|template|svg|iframe|canvas|nav|aside|form|button|select|footer";
const DROP_RE = new RegExp(`<(${DROP_TAGS})\\b[^<>]*>`, "gi");
const DROP_WITH_HEADER_RE = new RegExp(`<(${DROP_TAGS}|header)\\b[^<>]*>`, "gi");

/** 境目で段落を割るブロック要素と <br>。 */
const BREAK_RE =
  /<\/?(?:(br)|p|div|section|article|main|header|h[1-6]|li|ul|ol|dl|dt|dd|blockquote|table|tr|td|th|figure|figcaption|hr|details|summary)\b[^<>]*>/gi;

/*
 * 取り込むのは他人のページなので、悪意のある HTML でも処理時間が入力の長さに
 * 比例するようにしておく。`<script>[\s\S]*?</script>` のような「開始から終了まで」
 * の正規表現は、閉じられていない開始タグが大量にあると、その数だけ末尾まで
 * 読み直して二乗の時間がかかる (ReDoS)。タグの中身も `[^<>]*` に限っている。
 */

/**
 * open にマッチした位置から、closeFor が返す終了までを replace の結果で置き換える。
 * 終了が見つからなかった種類は、それ以降も見つからないので二度と探さない。
 */
function replaceElements(
  html: string,
  open: RegExp,
  closeFor: (match: RegExpExecArray) => string,
  replace: (inner: string) => string = () => "",
): string {
  const unclosed = new Set<string>();
  let out = "";
  let pos = 0;
  open.lastIndex = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const closeTag = closeFor(m);
    if (unclosed.has(closeTag)) continue;
    const close = new RegExp(closeTag, "gi");
    close.lastIndex = open.lastIndex;
    const end = close.exec(html);
    if (!end) {
      unclosed.add(closeTag);
      continue;
    }
    out += html.slice(pos, m.index) + replace(html.slice(open.lastIndex, end.index));
    pos = open.lastIndex = end.index + end[0].length;
  }
  return out + html.slice(pos);
}

/** 最初の <tag> から最後の </tag> まで。入れ子でも外側を丸ごと取る。 */
function outerContent(html: string, tag: string): string | null {
  const open = html.search(new RegExp(`<${tag}\\b`, "i"));
  if (open < 0) return null;
  let close = -1;
  for (const m of html.matchAll(new RegExp(`</${tag}\\s*>`, "gi"))) close = m.index;
  return close > open ? html.slice(open, close) : null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^<>]*>/g, ""));
}

/** 最初の <title> の中身。SVG にも <title> があるので最後の閉じタグは使えない。 */
function firstTitle(html: string): string {
  const open = /<title\b[^<>]*>/i.exec(html);
  if (!open) return "";
  const close = /<\/title\s*>/gi;
  close.lastIndex = open.index + open[0].length;
  const end = close.exec(html);
  return end ? html.slice(open.index + open[0].length, end.index) : "";
}

function pageTitle(html: string): string {
  const og = html.match(/<meta\s[^<>]*property=["']og:title["'][^<>]*>/i)?.[0]
    .match(/content=["']([^"']*)["']/i)?.[1];
  return stripTags(og ?? firstTitle(html)).replace(/\s+/g, " ").trim();
}

export function extractArticle(html: string): string[] {
  const scoped = outerContent(html, "article") ?? outerContent(html, "main");
  const body = scoped ?? outerContent(html, "body") ?? html;
  let content = replaceElements(body, /<!--/g, () => "-->");
  content = replaceElements(
    content,
    scoped ? DROP_RE : DROP_WITH_HEADER_RE,
    (m) => `</${m[1]}\\s*>`,
  );

  // コードブロックは改行を保ったまま 1 段落にしたいので、先に退避しておく。
  const preformatted: string[] = [];
  content = replaceElements(content, /<pre\b[^<>]*>/gi, () => "</pre\\s*>", (inner) => {
    preformatted.push(stripTags(inner).replace(/^\n+/, "").trimEnd());
    return `<p>\u0000${preformatted.length - 1}\u0000</p>`;
  });

  // HTML のソース上の改行はただの空白。改行になるのは <br> とブロックの境目だけ。
  content = content
    .replace(/\s+/g, " ")
    .replace(BREAK_RE, (_, br) => (br ? "\n" : "\n\n"));

  const paragraphs = stripTags(content)
    .split(/\n\s*\n/)
    .map((block) => {
      const pre = block.trim().match(/^\u0000(\d+)\u0000$/);
      if (pre) return preformatted[Number(pre[1])];
      return block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .join("\n");
    })
    .filter((p) => p !== "");

  // 見出しが本文に無いページでは、題名を先頭行にしてノートの題名にする。
  const title = pageTitle(html);
  if (title && !/<h1\b/i.test(body) && paragraphs[0] !== title) {
    paragraphs.unshift(title);
  }
  return paragraphs;
}
