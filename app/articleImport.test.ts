import { describe, expect, it } from "vitest";
import { parseImportUrl } from "./articleImport";

describe("parseImportUrl", () => {
  it("accepts http(s) and fills in a missing scheme", () => {
    expect(parseImportUrl(" https://a.example/x ")?.href).toBe("https://a.example/x");
    expect(parseImportUrl("http://a.example")?.href).toBe("http://a.example/");
    expect(parseImportUrl("a.example/post")?.href).toBe("https://a.example/post");
  });

  it("rejects other schemes and junk", () => {
    expect(parseImportUrl("")).toBeNull();
    expect(parseImportUrl("javascript:alert(1)")).toBeNull();
    expect(parseImportUrl("file:///etc/passwd")).toBeNull();
    expect(parseImportUrl("https://")).toBeNull();
  });

  // サーバーから取りに行くので、内部向けの宛先は受け付けない (SSRF)。
  it.each([
    "http://localhost:8787/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://intranet/",
    "http://printer.local/",
    "http://db.internal/",
    "http://app.localhost/",
    "https://user:pass@example.com/",
  ])("rejects %s", (input) => {
    expect(parseImportUrl(input)).toBeNull();
  });
});
