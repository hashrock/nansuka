import type { DrizzleD1Database } from "drizzle-orm/d1";
import { and, desc, eq } from "drizzle-orm";
import { notes, type Note } from "./schema";

export async function listNotes(
  db: DrizzleD1Database,
  userId: string,
): Promise<Note[]> {
  return db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}

/**
 * 所有者のノートだけを返す。他人のノートは「見つからない」と同じ扱いにして、
 * 存在の有無が漏れないようにする。
 */
export async function loadOwnedNote(
  db: DrizzleD1Database,
  id: string,
  userId: string,
): Promise<Note | null> {
  const note = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .get();
  return note ?? null;
}

export async function createNote(
  db: DrizzleD1Database,
  userId: string,
  title = "Untitled",
  content = "[]",
): Promise<Note> {
  const now = new Date().toISOString();
  const note: Note = {
    id: crypto.randomUUID(),
    userId,
    title,
    content,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(notes).values(note);
  return note;
}

export async function updateNote(
  db: DrizzleD1Database,
  id: string,
  userId: string,
  patch: { title?: string; content?: string },
): Promise<boolean> {
  const updated = await db
    .update(notes)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return updated.length > 0;
}

export async function deleteNote(
  db: DrizzleD1Database,
  id: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return deleted.length > 0;
}
