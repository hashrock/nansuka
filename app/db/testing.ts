/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * テスト専用: node:sqlite の上に drizzle-orm/d1 が使う分だけの D1Database を被せる。
 * SQL の中身 (datetime の境界や LIKE の除外) を実際の SQLite で確かめたいときに使う。
 * migrations/ をそのまま流すので、スキーマは本番と同じ。
 */
export function sqliteD1(): { d1: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "../../migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  const prepare = (query: string) => {
    let params: unknown[] = [];
    const stmt = sqlite.prepare(query);
    const rows = (arrays: boolean) => {
      // raw() は列名の重複 (同じ式の count が 2 つ等) があっても位置で返す必要がある。
      stmt.setReturnArrays(arrays);
      return stmt.all(...(params as never[])) as unknown[];
    };
    const bound = {
      bind(...values: unknown[]) {
        params = values;
        return bound;
      },
      async all() {
        return { results: rows(false), success: true, meta: {} };
      },
      async raw() {
        return rows(true);
      },
      async first() {
        return rows(false)[0] ?? null;
      },
      async run() {
        stmt.run(...(params as never[]));
        return { results: [], success: true, meta: {} };
      },
    };
    return bound;
  };

  return { d1: { prepare } as unknown as D1Database, sqlite };
}
