import { Head, Link, router } from "@inertiajs/react";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { clearLocalDraft, readLocalDraft } from "../../grid/localDraft";
import { serializeRows } from "../../grid/rowsCodec";
import { deriveNoteTitle } from "../../domain/noteTitle";
import { filterNotesByTitle } from "../../domain/noteFilter";
import type { Row } from "../../grid/types";
import type { SessionUser } from "../../user";
import "../../App.css";

type NoteSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

/** これより多いときだけ絞り込み欄を出す。数件なら目で追える。 */
const FILTER_THRESHOLD = 5;

export default function NotesIndex({
  user,
  credits,
  notes,
  missing = false,
}: {
  user: SessionUser;
  credits: number;
  notes: NoteSummary[];
  /** 開こうとしたノートが自分のものとして見つからず、一覧へ戻された (#2)。 */
  missing?: boolean;
}) {
  // ログイン導入前にブラウザへ溜まっていた下書きの取り込みを一度だけ勧める。
  // 保存に失敗して退避した本文 (#2) もここに来る。
  const [draft, setDraft] = useState<Row[] | null>(null);
  useEffect(() => setDraft(readLocalDraft()), []);

  // 「削除」は 1 クリックで消えて取り消せなかった (#3)。行の中で確認を挟む。
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterNotesByTitle(notes, query), [notes, query]);

  const createNote = (rows?: Row[]) => {
    router.post("/notes", {
      content: rows ? serializeRows(rows) : "[]",
      title: rows ? deriveNoteTitle(rows.map((r) => r.source)) : "",
    });
  };

  const importDraft = () => {
    if (!draft) return;
    createNote(draft);
    clearLocalDraft();
    setDraft(null);
  };

  const remove = (note: NoteSummary) => {
    setConfirmingId(null);
    router.post(`/notes/${note.id}/delete`, {}, { preserveScroll: true });
  };

  return (
    <>
      <Head title="ノート - Nansuka" />
      <div className="page">
        <AppHeader user={user} credits={credits} />

        <main className="notes">
          <div className="notes-bar">
            <h1>ノート</h1>
            <button className="primary-btn" onClick={() => createNote()}>
              新しいノート
            </button>
          </div>

          {missing && (
            <div className="notice" role="status">
              開こうとしたノートは見つかりませんでした。削除されたか、別のアカウントで
              ログインしている可能性があります。
            </div>
          )}

          {draft && (
            <div className="draft-banner">
              <span>
                このブラウザに保存された下書きがあります（{draft.length} 行）。
              </span>
              <button className="tool-btn" onClick={importDraft}>
                ノートとして取り込む
              </button>
              <button
                className="tool-btn"
                onClick={() => {
                  clearLocalDraft();
                  setDraft(null);
                }}
              >
                破棄
              </button>
            </div>
          )}

          {notes.length > FILTER_THRESHOLD && (
            <input
              type="search"
              className="note-filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="題名で絞り込む"
              aria-label="題名で絞り込む"
            />
          )}

          {notes.length === 0 ? (
            <p className="empty">
              まだノートがありません。「新しいノート」から始めてください。
            </p>
          ) : visible.length === 0 ? (
            <p className="empty">「{query.trim()}」を含む題名のノートはありません。</p>
          ) : (
            <ul className="note-list">
              {visible.map((note) => (
                <li key={note.id}>
                  <Link href={`/notes/${note.id}`} className="note-link">
                    <span className="note-title">{note.title}</span>
                    <span className="note-date">
                      {new Date(note.updatedAt).toLocaleString("ja-JP")}
                    </span>
                  </Link>
                  {confirmingId === note.id ? (
                    <span className="note-confirm" role="group" aria-label="削除の確認">
                      <span>削除しますか？</span>
                      <button
                        className="tool-btn danger-btn"
                        onClick={() => remove(note)}
                        aria-label={`${note.title} を削除する`}
                      >
                        削除する
                      </button>
                      <button className="tool-btn" onClick={() => setConfirmingId(null)}>
                        キャンセル
                      </button>
                    </span>
                  ) : (
                    <button
                      className="tool-btn"
                      onClick={() => setConfirmingId(note.id)}
                      aria-label={`${note.title} を削除`}
                    >
                      削除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </>
  );
}
