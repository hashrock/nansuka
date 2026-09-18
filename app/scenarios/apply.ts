import type { DrizzleD1Database } from "drizzle-orm/d1";
import { createNote, updateNote } from "../db/notes";
import { getBalance, grantCredits, spendCredits } from "../db/credits";
import { createUser } from "../db/users";
import { serializeRows } from "../grid/rowsCodec";
import type { SessionUser } from "../user";
import { noteTimestamp, scenarioClock, type ScenarioClock } from "./clock";
import type { ScenarioPlan, ScenarioTarget } from "./types";

export type CreatedNote = { id: string; title: string; url: string };

export type ScenarioResult = {
  notes: CreatedNote[];
  credits: number;
  url: string;
};

/**
 * ノート画面の URL。開いただけで自動翻訳やコンテキスト要約が走って
 * クレジットが減らないよう、autoTranslate=0 を付けて開く。
 */
export function noteUrl(id: string): string {
  return `/notes/${id}?autoTranslate=0`;
}

/** シナリオ専用のユーザー。メールは到達しないドメインにしておく。 */
export async function createScenarioUser(
  db: DrizzleD1Database,
  label: string,
  clock: ScenarioClock = scenarioClock(),
): Promise<SessionUser> {
  const user = await createUser(
    db,
    { email: `${label}@scenario.invalid`, name: label, avatarUrl: null },
    // id も label にして、集計 (app/db/stats.ts) が接頭辞で除外できるようにする。
    { now: clock.at(0), id: label },
  );
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
 * 時刻は clock から振り、並び順を実行ごとに変えない。
 */
export async function applyPlan(
  db: DrizzleD1Database,
  userId: string,
  plan: ScenarioPlan,
  withLedger: boolean,
  clock: ScenarioClock = scenarioClock(),
): Promise<ScenarioResult> {
  const notes: CreatedNote[] = [];
  for (const [index, item] of plan.notes.entries()) {
    const now = noteTimestamp(clock, index, plan.notes.length);
    const note = await createNote(db, userId, item.title, serializeRows(item.rows), { now });
    if (item.prompt !== undefined) {
      await updateNote(db, note.id, userId, { prompt: item.prompt }, { now });
    }
    notes.push({ id: note.id, title: note.title, url: noteUrl(note.id) });
  }

  // 台帳はノートより後の時刻にして、履歴の並びを計画の順に固定する。
  let step = plan.notes.length + 1;
  for (const entry of withLedger ? plan.ledger : []) {
    const now = clock.at(step++);
    if (entry.kind === "grant") {
      await grantCredits(db, userId, entry.amount, entry.reason, { now });
      continue;
    }
    const noteId = entry.noteIndex === undefined ? undefined : notes[entry.noteIndex]?.id;
    const spent = await spendCredits(db, userId, entry.amount, entry.reason, noteId, { now });
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
