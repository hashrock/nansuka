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
});
