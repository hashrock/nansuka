import { describe, expect, it } from "vitest";
import { decodeEntities, extractArticle } from "./article";

describe("extractArticle", () => {
  it("splits block elements into paragraphs and drops chrome", () => {
    const html = `<html><head><title>Ignored</title><script>var x = "<p>no</p>";</script></head>
      <body><header><a>Home</a></header><nav><li>Menu</li></nav>
      <h1>Hello</h1>
      <p>First
        paragraph with <a href="#">a link</a>.</p>
      <div>Second</div>
      <footer>© site</footer></body></html>`;
    expect(extractArticle(html)).toEqual([
      "Hello",
      "First paragraph with a link.",
      "Second",
    ]);
  });

  it("prefers the article element and keeps its header", () => {
    const html = `<body><div>Sidebar</div><article><header><h1>Title</h1></header>
      <p>Body</p></article><div>Related</div></body>`;
    expect(extractArticle(html)).toEqual(["Title", "Body"]);
  });

  it("keeps line breaks inside pre and br", () => {
    const html = `<main><p>a<br>b</p><pre><code>if (x) {
  y();
}</code></pre></main>`;
    expect(extractArticle(html)).toEqual(["a\nb", "if (x) {\n  y();\n}"]);
  });

  it("uses the page title as the first row when there is no h1", () => {
    const html = `<head><meta property="og:title" content="Big &amp; News"></head><body><p>Text</p></body>`;
    expect(extractArticle(html)).toEqual(["Big & News", "Text"]);
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("&lt;a&gt; &#39;b&#x27; &nbsp;&hellip;&unknown;")).toBe(
      "<a> 'b'  …&unknown;",
    );
  });
});
