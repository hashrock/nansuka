import { Head, Link, router } from "@inertiajs/react";
import { useEffect, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { clearLocalDraft, readLocalDraft } from "../../grid/localDraft";
import { serializeRows } from "../../grid/rowsCodec";
import { deriveNoteTitle } from "../../domain/noteTitle";
import type { Row } from "../../grid/types";
import type { SessionUser } from "../../user";
import "../../App.css";

type NoteSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export default function NotesIndex({
  user,
  credits,
  notes,
}: {
  user: SessionUser;
  credits: number;
  notes: NoteSummary[];
}) {
  // ログイン導入前にブラウザへ溜まっていた下書きの取り込みを一度だけ勧める。
  const [draft, setDraft] = useState<Row[] | null>(null);
  useEffect(() => setDraft(readLocalDraft()), []);

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

          {notes.length === 0 ? (
            <p className="empty">
              まだノートがありません。「新しいノート」から始めてください。
            </p>
          ) : (
            <ul className="note-list">
              {notes.map((note) => (
                <li key={note.id}>
                  <Link href={`/notes/${note.id}`} className="note-link">
                    <span className="note-title">{note.title}</span>
                    <span className="note-date">
                      {new Date(note.updatedAt).toLocaleString("ja-JP")}
                    </span>
                  </Link>
                  <button
                    className="tool-btn"
                    onClick={() => remove(note)}
                    aria-label={`${note.title} を削除`}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </>
  );
}
