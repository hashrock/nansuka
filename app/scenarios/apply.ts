import type { DrizzleD1Database } from "drizzle-orm/d1";
import { createNote, updateNote } from "../db/notes";
import { getBalance, grantCredits, spendCredits } from "../db/credits";
import { createUser } from "../db/users";
import { serializeRows } from "../grid/rowsCodec";
import type { SessionUser } from "../user";
import type { ScenarioPlan, ScenarioTarget } from "./types";

export type CreatedNote = { id: string; title: string; url: string };

export type ScenarioResult = {
  notes: CreatedNote[];
  credits: number;
  url: string;
};

/** シナリオ専用のユーザー。メールは到達しないドメインにしておく。 */
export async function createScenarioUser(
  db: DrizzleD1Database,
  label: string,
): Promise<SessionUser> {
  const user = await createUser(db, {
    email: `${label}@scenario.invalid`,
    name: label,
    avatarUrl: null,
  });
  return { id: user.id, email: user.email, name: user.name ?? "", avatarUrl: "" };
}

export function targetUrl(target: ScenarioTarget, notes: CreatedNote[]): string {
  switch (target.kind) {
    case "notes":
      return "/notes";
    case "account":
      return "/account";
    case "note":
      return notes[target.index]?.url ?? "/notes";
  }
}

/**
 * 計画どおりにノートと台帳を作る。ドメイン層の関数だけを使い、SQL は書かない。
 * 台帳は残高を動かすので、シナリオ用に作った新規ユーザーのときだけ書く。
 * 本人のアカウント (withLedger=false) ではノートだけ作り、残高には触れない。
 */
export async function applyPlan(
  db: DrizzleD1Database,
  userId: string,
  plan: ScenarioPlan,
  withLedger: boolean,
): Promise<ScenarioResult> {
  const notes: CreatedNote[] = [];
  for (const item of plan.notes) {
    const note = await createNote(db, userId, item.title, serializeRows(item.rows));
    if (item.prompt !== undefined) {
      await updateNote(db, note.id, userId, { prompt: item.prompt });
    }
    notes.push({ id: note.id, title: note.title, url: `/notes/${note.id}` });
  }

  for (const entry of withLedger ? plan.ledger : []) {
    if (entry.kind === "grant") {
      await grantCredits(db, userId, entry.amount, entry.reason);
      continue;
    }
    const noteId = entry.noteIndex === undefined ? undefined : notes[entry.noteIndex]?.id;
    const spent = await spendCredits(db, userId, entry.amount, entry.reason, noteId);
    if (!spent.ok) {
      throw new Error(`残高不足で台帳を作れません (必要: ${entry.amount} / 残高: ${spent.balance})`);
    }
  }

  return {
    notes,
    credits: await getBalance(db, userId),
    url: targetUrl(plan.target, notes),
  };
}
