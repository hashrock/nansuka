import type { DrizzleD1Database } from "drizzle-orm/d1";
import { users, INITIAL_CREDITS, type User } from "./schema";
import { grantCredits } from "./credits";
import { newId, nowIso, type WriteOptions } from "./options";

export type NewUser = {
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

/**
 * 新規ユーザーを作って初期クレジットを付与する。
 * 既定値ではなく 0 で作ってから付与するのは、初期付与も台帳に残したいため。
 */
export async function createUser(
  db: DrizzleD1Database,
  input: NewUser,
  options?: WriteOptions,
  initialCredits = INITIAL_CREDITS,
): Promise<User> {
  const user: User = {
    id: newId(options),
    email: input.email,
    name: input.name,
    avatarUrl: input.avatarUrl,
    credits: 0,
    createdAt: nowIso(options),
  };
  await db.insert(users).values(user);
  if (initialCredits > 0) {
    user.credits = await grantCredits(db, user.id, initialCredits, "signup", options);
  }
  return user;
}
