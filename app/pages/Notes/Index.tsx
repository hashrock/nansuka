import { Head, Link, router, useForm } from "@inertiajs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "../../components/AppHeader";
import { clearLocalDraft, readLocalDraft } from "../../grid/localDraft";
import { serializeRows } from "../../grid/rowsCodec";
import { deriveNoteTitle } from "../../domain/noteTitle";
import { filterNotesByTitle } from "../../domain/noteFilter";
import type { Row } from "../../grid/types";
import type { SessionUser } from "../../user";
import type { ImportErrorCode } from "../../articleImport";
import "../../App.css";

type NoteSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

const IMPORT_ERRORS: Record<ImportErrorCode, string> = {
  "invalid-url": "http:// か https:// で始まる URL を入れてください。",
  fetch: "ページを読み込めませんでした。URL が正しいか、公開されているページか確認してください。",
  unsupported: "HTML かテキストのページだけ取り込めます。",
  empty: "ページから本文を見つけられませんでした。本文をコピーして新しいノートに貼り付けてください。",
  "rate-limited": "短い時間に取り込みすぎました。1 分ほど待ってからもう一度試してください。",
};

/**
 * 開いているページを ?import= 付きで一覧に送るブックマークレット。
 * React 19 は javascript: の href を描画しないので、DOM に直接入れる。
 */
function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute(
      "href",
      `javascript:location.href='${location.origin}/notes?import='+encodeURIComponent(location.href)`,
    );
  }, []);
  return (
    <a ref={ref} className="bookmarklet" onClick={(e) => e.preventDefault()}>
      Nansuka で読む
    </a>
  );
}

/** これより多いときだけ絞り込み欄を出す。数件なら目で追える。 */
const FILTER_THRESHOLD = 5;

export default function NotesIndex({
  user,
  credits,
  notes,
  missing = false,
  importUrl = "",
  importError = null,
}: {
  user: SessionUser;
  credits: number;
  notes: NoteSummary[];
  /** 開こうとしたノートが自分のものとして見つからず、一覧へ戻された (#2)。 */
  missing?: boolean;
  /** ブックマークレットから渡された、取り込み待ちの URL。 */
  importUrl?: string;
  importError?: string | null;
}) {
  // ログイン導入前にブラウザへ溜まっていた下書きの取り込みを一度だけ勧める。
  // 保存に失敗して退避した本文 (#2) もここに来る。
  const [draft, setDraft] = useState<Row[] | null>(null);
  useEffect(() => setDraft(readLocalDraft()), []);

  // 「削除」は 1 クリックで消えて取り消せなかった (#3)。行の中で確認を挟む。
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const importForm = useForm({ url: importUrl });
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

          <form
            className="import-form"
            onSubmit={(e) => {
              e.preventDefault();
              importForm.post("/notes/import");
            }}
          >
            <input
              type="text"
              inputMode="url"
              value={importForm.data.url}
              onChange={(e) => importForm.setData("url", e.target.value)}
              placeholder="英語の記事やドキュメントの URL を貼ると、段落ごとの対訳ノートになります"
              aria-label="取り込む URL"
              autoFocus={importUrl !== ""}
              required
            />
            <button className="primary-btn" type="submit" disabled={importForm.processing}>
              {importForm.processing ? "読み込み中…" : "対訳で読む"}
            </button>
          </form>
          {importError && (
            <div className="notice" role="alert">
              {IMPORT_ERRORS[importError as ImportErrorCode] ?? IMPORT_ERRORS.fetch}
            </div>
          )}
          <p className="import-hint">
            <BookmarkletLink /> をブックマークバーにドラッグしておくと、読んでいるページからそのまま開けます。
          </p>

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
              まだノートがありません。上の欄に記事の URL を貼るか、「新しいノート」に文章を貼り付けて始めてください。
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
