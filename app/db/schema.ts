import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/** 新規ユーザーに与える初期クレジット。運用しながら調整する前提の仮の量。 */
export const INITIAL_CREDITS = 1000;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  /** 残高。翻訳のたびに減る。CHECK 制約で負にならないよう DB 側でも守る。 */
  credits: integer("credits").notNull().default(INITIAL_CREDITS),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

/**
 * 翻訳ノート。content はグリッドの行 (Row[]) を JSON 文字列にしたもの。
 * 行の構造はクライアント側の関心事なので、DB では中身を解釈しない。
 */
export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull().default("Untitled"),
    content: text("content").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index("notes_user_updated_idx").on(table.userId, table.updatedAt)],
);

/**
 * クレジットの増減履歴。users.credits が現在の残高で、こちらはその内訳。
 * 残高だけだと「何に使ったか」を後から説明できないので両方持つ。
 */
export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 消費は負、付与は正。 */
    delta: integer("delta").notNull(),
    /** "signup" | "translate" | "context" など。 */
    reason: text("reason").notNull(),
    /** 消費後の残高。後から残高を再計算せずに履歴を読めるようにする。 */
    balance: integer("balance").notNull(),
    noteId: text("note_id"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("credit_ledger_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type CreditEntry = typeof creditLedger.$inferSelect;
