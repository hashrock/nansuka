import { Head, Link } from "@inertiajs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { StylePanel } from "../components/StylePanel";
import { useLocalStorage } from "../useLocalStorage";
import { useAutoContext } from "../useAutoContext";
import { useToast, ToastContainer } from "../Toast";
import { Grid } from "../grid/Grid";
import { useGridStore } from "../grid/useGridStore";
import { parseRows, serializeRows } from "../grid/rowsCodec";
import { insertRows } from "../grid/operations";
import { singleCell, toRect } from "../grid/selection";
import { COL_SOURCE, type Row } from "../grid/types";
import {
  copyRange,
  countCopyableTranslations,
  translatedTextForCopy,
} from "../grid/copyText";
import { translateButtonLabel } from "../grid/translationQueue";
import { clearLocalDraft, writeLocalDraft } from "../grid/localDraft";
import { useRowTranslation } from "../useRowTranslation";
import { deriveNoteTitle } from "../domain/noteTitle";
import {
  canRetrySave,
  classifySaveFailure,
  saveFailureAdvice,
  saveFailureMessage,
  type SaveFailure,
} from "../domain/saveState";
import { SUPPORT_URL } from "../config";
import { copyTextToClipboard } from "../utils/clipboard";
import {
  DEFAULT_TASK_PROMPT,
  PROMPT_PRESETS,
  normalizePrompt,
  outputLabels,
} from "../domain/prompt";
import { canAfford, translationCost } from "../domain/credits";
import { isJapanese } from "../utils";
import {
  DEFAULT_STYLE,
  isDefaultStyle,
  lengthRatio,
  previewLength,
  type StyleParams,
} from "../domain/style";
import type { SessionUser } from "../user";
import "../App.css";

/** 打鍵のたびに保存しないための待ち時間。 */
const AUTOSAVE_MS = 800;
/** スライダーを離してから再翻訳を投げるまでの待ち時間。 */
const RESTYLE_MS = 600;

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Translate({
  user,
  credits: initialCredits,
  note,
  autoTranslate = true,
}: {
  user: SessionUser;
  credits: number;
  note: { id: string; title: string; content: string; prompt: string | null };
  /**
   * false なら開いただけでは翻訳もコンテキスト要約も走らせない。
   * 明示的な操作 (再翻訳・再生成) は通す。UI テストのシナリオが使う。
   */
  autoTranslate?: boolean;
}) {
  const [context, setContext] = useLocalStorage(
    `nansuka-context:${note.id}`,
    "",
  );
  const [autoGenerateContext, setAutoGenerateContext] = useLocalStorage(
    "nansuka-auto-context",
    true,
  );
  // ノート設定 (プロンプト + コンテキスト) を 1 つのモーダルで扱う。
  const [isNoteSettingsOpen, setIsNoteSettingsOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  // モーダルを開いた時点の Context。開いている間に自動生成が完了しても、
  // ユーザーが書き換えたかどうかはこれと比べて判定する。
  const openedContextRef = useRef("");

  // ノート固有のプロンプト。null なら既定の翻訳。
  const [prompt, setPrompt] = useState<string | null>(normalizePrompt(note.prompt));
  const [promptDraft, setPromptDraft] = useState("");
  const [noteSettingsSaving, setNoteSettingsSaving] = useState(false);
  const promptRef = useRef(prompt);
  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);
  const labels = outputLabels(prompt !== null);

  // 前回どこかのノートで使ったプロンプト。新しいノートで打ち直さずに済む。
  const [lastPrompt, setLastPrompt] = useLocalStorage<string | null>(
    "nansuka-last-prompt",
    null,
  );
  const [credits, setCredits] = useState(initialCredits);

  // --- 文章調整 -------------------------------------------------------
  const [showStyle, setShowStyle] = useState(false);
  // 選択範囲ごとの一時的な調整値。選択を変えたら既定に戻る。
  const [style, setStyle] = useState<StyleParams>(DEFAULT_STYLE);
  const styleRef = useRef(style);
  useEffect(() => {
    styleRef.current = style;
  }, [style]);
  // 直近に翻訳へ使った文章長。プレビューはこれを基準に伸縮させる。
  const [appliedLength, setAppliedLength] = useState(style.length);
  const [draggingLength, setDraggingLength] = useState(false);
  // ドラッグ開始は onChange より前に来るが、両方が同じ描画にまとまることが
  // あるので、判定は ref でも持って最初の onChange から確実にプレビューする。
  const draggingLengthRef = useRef(false);
  const handleDragLength = useCallback((dragging: boolean) => {
    draggingLengthRef.current = dragging;
    setDraggingLength(dragging);
  }, []);
  const restyleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  /** 直近の保存失敗の種類。表示する説明と「再試行」の出し分けに使う (#2)。 */
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  // 失敗時に本文をブラウザへ退避したか。次に成功したら消す。
  const draftStashedRef = useRef(false);

  // ノートの本文はサーバーから来た1回きりの初期値。以降はクライアントが持つ。
  const initialRows = useMemo(() => parseRows(note.content), [note.content]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persist = useCallback(
    (rows: Row[], { immediate = false } = {}) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState("saving");
      const save = async () => {
        let status: number | null = null;
        try {
          const response = await fetch(`/api/notes/${note.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: serializeRows(rows),
              // 独自プロンプト (校正・要約など) のノートは出力の方が
              // タイトルにふさわしい。誤字入りの原稿がそのまま並ばないように。
              sources: promptRef.current
                ? rows.map((row) => row.translated || row.source)
                : rows.map((row) => row.source),
            }),
          });
          status = response.status;
          if (response.ok) {
            setSaveState("saved");
            setSaveFailure(null);
            if (draftStashedRef.current) {
              draftStashedRef.current = false;
              clearLocalDraft();
            }
            return;
          }
        } catch {
          // status は null のまま (通信失敗)
        }
        // 失敗しても入力は失わない。ブラウザに退避して、一覧から取り込めるようにする。
        draftStashedRef.current = writeLocalDraft(rows) || draftStashedRef.current;
        setSaveState("error");
        setSaveFailure(classifySaveFailure(status));
      };
      if (immediate) void save();
      else saveTimerRef.current = setTimeout(save, AUTOSAVE_MS);
    },
    [note.id],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // 保存が済んでいない間にタブを閉じようとしたら止める。
  useEffect(() => {
    if (saveState !== "saving" && saveState !== "error") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const {
    rows,
    selection,
    canUndo,
    canRedo,
    commit,
    select,
    patch,
    undo,
    redo,
  } = useGridStore({ initialRows, onPersist: persist });

  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  // コンテキスト要約は原文カラム全体を1つの文書として扱う。
  const sourceText = useMemo(
    () =>
      rows
        .map((row) => row.source.trim())
        .filter(Boolean)
        .join("\n\n"),
    [rows],
  );

  const { toasts, showToast } = useToast();

  const {
    error,
    creditsShort,
    stalled,
    translatingIds,
    retranslate,
    pending,
    approvePending,
    dismissPending,
  } = useRowTranslation({
    rows,
    patch,
    commit,
    contextRef,
    styleRef,
    promptRef,
    noteId: note.id,
    onCredits: setCredits,
    autoTranslate,
    // 開いただけ・確定しただけで走った翻訳は、残高が減った理由を知らせる (#9)。
    onAutoTranslated: ({ count, cost }) =>
      showToast(
        count === 1
          ? `1 行を自動で${labels.regenerate.slice(1)}しました (-${cost} cr)`
          : `未処理の ${count} 行を自動で${labels.regenerate.slice(1)}しました (-${cost} cr)`,
      ),
  });

  // 原文と同じ言語の出力 (校正・言い換え) では差分表示が役に立つ。
  const [showDiff, setShowDiff] = useLocalStorage("nansuka-show-diff", true);
  const canDiff =
    prompt !== null &&
    rows.some(
      (row) =>
        row.translated !== "" && isJapanese(row.source) === isJapanese(row.translated),
    );

  useAutoContext({
    input: sourceText,
    autoGenerateContext: autoGenerateContext && autoTranslate,
    setContext,
    noteId: note.id,
    onCredits: setCredits,
    // 頼んでいないのに残高が減ったように見えないよう、生成したことを知らせる。
    onGenerated: (cost) => showToast(`Context を自動生成しました (-${cost} cr)`),
  });

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // 直近に翻訳へ使った値。クリックしただけで値が変わらなければ何もしない。
  const appliedStyleRef = useRef(style);

  // 選択範囲が変わったらスライダーを既定に戻す。調整は選択中の行に対する
  // 一時的なもので、別の行に持ち越さない。
  const rect = toRect(selection);
  const rectKey = `${rect.top}:${rect.bottom}:${rect.left}:${rect.right}`;
  useEffect(() => {
    if (!isDefaultStyle(styleRef.current)) setStyle(DEFAULT_STYLE);
    styleRef.current = DEFAULT_STYLE;
    appliedStyleRef.current = DEFAULT_STYLE;
    setAppliedLength(DEFAULT_STYLE.length);
    draggingLengthRef.current = false;
    setDraggingLength(false);
  }, [rectKey]);

  /** スライダーを離したら、少し待ってから選択中の行だけを訳し直す。 */
  const handleStyleRelease = useCallback(
    (next: StyleParams) => {
      if (restyleTimerRef.current) clearTimeout(restyleTimerRef.current);
      // 待っている間に選択が動いても、離した時点の行を訳し直す。
      const target = toRect(selection);
      restyleTimerRef.current = setTimeout(() => {
        const applied = appliedStyleRef.current;
        if (
          applied.length === next.length &&
          applied.concise === next.concise &&
          applied.friendly === next.friendly
        ) {
          return;
        }
        appliedStyleRef.current = next;
        styleRef.current = next;
        setAppliedLength(next.length);
        const ids = rowsRef.current
          .slice(target.top, target.bottom + 1)
          .filter((row) => row.source.trim() !== "")
          .map((row) => row.id);
        if (ids.length > 0) retranslate(ids);
      }, RESTYLE_MS);
    },
    [retranslate, selection],
  );
  useEffect(() => {
    return () => {
      if (restyleTimerRef.current) clearTimeout(restyleTimerRef.current);
    };
  }, []);

  // 文章長をドラッグしている間だけ、選択中の行の訳文を切り詰め/水増しして見せる。
  const previewTranslated = useMemo(() => {
    if (!draggingLength) return undefined;
    const ratio = lengthRatio(style.length) / lengthRatio(appliedLength);
    return (text: string) => previewLength(text, ratio);
  }, [draggingLength, style.length, appliedLength]);

  // Esc で閉じられなかった (#14)。グリッドが編集の取り消しに使った Esc は
  // defaultPrevented になっているので、そちらを優先する。
  useEffect(() => {
    if (!isNoteSettingsOpen && !showStyle) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isNoteSettingsOpen) setIsNoteSettingsOpen(false);
      else setShowStyle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNoteSettingsOpen, showStyle]);

  const openNoteSettings = () => {
    setPromptDraft(prompt ?? "");
    setContextDraft(context);
    openedContextRef.current = context;
    setIsNoteSettingsOpen(true);
  };

  /**
   * コンテキストは localStorage、プロンプトはサーバーに保存する。
   * 手書きしたコンテキストを自動生成で上書きしないよう、変えたら自動生成を切る。
   */
  /** 原文のある行。全行再生成の対象と費用の見積もりに使う。 */
  const filledRows = rows.filter((row) => row.source.trim() !== "");
  const regenerateAllCost = translationCost(filledRows.map((row) => row.source));

  /**
   * @param regenerateAll 保存後に原文のある全行を作り直す。
   *   費用はボタンに出しているので確認は挟まない。
   */
  const handleNoteSettingsSave = async (regenerateAll = false) => {
    if (contextDraft !== openedContextRef.current) {
      setAutoGenerateContext(false);
      setContext(contextDraft);
    }

    const nextPrompt = normalizePrompt(promptDraft);
    const nextLabels = outputLabels(nextPrompt !== null);
    const regenerate = () => {
      if (filledRows.length > 0) retranslate(filledRows.map((row) => row.id));
    };

    if (nextPrompt === prompt) {
      setIsNoteSettingsOpen(false);
      if (regenerateAll) regenerate();
      return;
    }

    setNoteSettingsSaving(true);
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      setPrompt(nextPrompt);
      promptRef.current = nextPrompt;
      if (nextPrompt !== null) setLastPrompt(nextPrompt);
      // タイトルの決め方がプロンプトの有無で変わるので、本文も保存し直す。
      persist(rowsRef.current);
      setIsNoteSettingsOpen(false);
      if (regenerateAll) {
        regenerate();
      } else {
        showToast(`プロンプトを保存しました。「${nextLabels.regenerate}」で反映されます`);
      }
    } catch {
      showToast("プロンプトを保存できませんでした");
    } finally {
      setNoteSettingsSaving(false);
    }
  };

  const addRow = () => {
    const next = insertRows(rows, rows.length, 1);
    commit(next, singleCell({ row: next.length - 1, col: COL_SOURCE }));
  };

  const retranslateSelection = () => {
    retranslate(rows.slice(rect.top, rect.bottom + 1).map((row) => row.id));
  };
  const translateLabel = translateButtonLabel(rows, rect, labels.regenerate);

  // 訳文を持ち出す経路が右クリックにしか無かった (#8)。ツールバーに置く。
  // 選択行に訳文が無ければノート全体の訳文を対象にする。
  const copyRect = copyRange(rows, rect);
  const copyableCount = countCopyableTranslations(rows, copyRect);
  const copyTranslations = async () => {
    const text = translatedTextForCopy(rows, copyRect);
    if (!text) return;
    const ok = await copyTextToClipboard(text);
    showToast(
      !ok
        ? "コピーできませんでした。セルを選んで Ctrl+C / Cmd+C をお試しください"
        : copyableCount === 1
          ? `${labels.column}をコピーしました`
          : `${copyableCount} 行の${labels.column}をコピーしました`,
    );
  };

  // 空欄のまま止まっている行をまとめて頼めるようにする (#9)。
  const stalledCost = translationCost(stalled.map((row) => row.source));
  const translateStalled = () => retranslate(stalled.map((row) => row.id));

  const title = deriveNoteTitle(rows.map((row) => row.source));

  return (
    <>
      <Head title={`${title} - Nansuka`} />
      <div className="translate-page">
        <AppHeader user={user} credits={credits} showBack>
          <span className="note-heading">{title}</span>
          <span className={`save-state is-${saveState}`} role="status">
            {saveState === "saving" && "保存中…"}
            {saveState === "saved" && "保存しました"}
            {saveState === "error" && "保存できませんでした"}
          </span>
          <button
            className={`context-badge${prompt ? " is-custom" : ""}`}
            onClick={openNoteSettings}
            title={[
              prompt ? `指示: ${prompt}` : "指示: 既定の翻訳",
              context ? `背景情報: ${context}` : "",
            ]
              .filter(Boolean)
              .join("\n")}
          >
            ノート設定{prompt ? " ✎" : ""}
          </button>
        </AppHeader>

        {/* ボタンにフォーカスを移さない。グリッドの入力欄がフォーカスを
            持ったままなので、押した直後にそのままタイプを続けられる。 */}
        <div className="toolbar" onMouseDown={(e) => e.preventDefault()}>
          <button className="tool-btn" onClick={addRow}>
            行を追加
          </button>
          <button
            className="tool-btn"
            onClick={retranslateSelection}
            title={`選択中の行を${labels.regenerate}します (クレジットを使います)`}
          >
            {translateLabel}
          </button>
          <button
            className="tool-btn"
            onClick={copyTranslations}
            disabled={copyableCount === 0}
            title={
              copyableCount === 0
                ? `コピーできる${labels.column}がありません`
                : copyRect === rect
                  ? `選択中の行の${labels.column}をコピーします`
                  : `ノート全体の${labels.column}をコピーします`
            }
          >
            {labels.column}をコピー
          </button>
          {canDiff && (
            <button
              className={`tool-btn${showDiff ? " is-active" : ""}`}
              onClick={() => setShowDiff((v) => !v)}
              aria-pressed={showDiff}
              title="原文からの変更箇所に印を付けます"
            >
              差分
            </button>
          )}
          <span className="toolbar-sep" />
          <button className="tool-btn" onClick={undo} disabled={!canUndo}>
            元に戻す
          </button>
          <button className="tool-btn" onClick={redo} disabled={!canRedo}>
            やり直す
          </button>
          <button
            className={`tool-btn tool-btn-right${showStyle ? " is-active" : ""}`}
            onClick={() => setShowStyle((v) => !v)}
            aria-pressed={showStyle}
          >
            <svg
              className="tool-icon"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              aria-hidden="true"
            >
              <path
                d="M2 4h12M2 8h12M2 12h12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="5" cy="4" r="1.8" fill="currentColor" />
              <circle cx="11" cy="8" r="1.8" fill="currentColor" />
              <circle cx="7" cy="12" r="1.8" fill="currentColor" />
            </svg>
            文章調整
          </button>
        </div>

        {/* 保存の失敗は理由と対処を出す。本文は退避してあるので消えない (#2)。 */}
        {saveState === "error" && saveFailure && (
          <div className="error save-error" role="alert">
            <div>
              <strong>{saveFailureMessage(saveFailure)}。</strong>{" "}
              {saveFailureAdvice(saveFailure)}
            </div>
            <div className="save-error-actions">
              {canRetrySave(saveFailure) && (
                <button
                  className="tool-btn"
                  onClick={() => persist(rowsRef.current, { immediate: true })}
                >
                  再試行
                </button>
              )}
              <Link href="/notes" className="tool-btn">
                ノート一覧へ
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="error" role="alert">
            {error}
            {/* 残高不足は行き止まりにしない。確認先と相談先を添える (#4)。 */}
            {creditsShort && (
              <>
                {" "}
                残高は <Link href="/account">アカウント</Link> で確認できます。追加購入は
                まだ無く、必要な場合は{" "}
                <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
                  運営に連絡
                </a>
                してください。
              </>
            )}
          </div>
        )}

        {/* 訳文が空のまま止まっている行。自動翻訳が拾わないので、まとめて頼めるようにする (#9) */}
        {!pending && stalled.length > 0 && (
          <div className="bulk-notice" onMouseDown={(e) => e.preventDefault()}>
            <span>
              {labels.column}が空の行が {stalled.length} 行あります (約 {stalledCost} cr)。
            </span>
            {canAfford(credits, stalledCost) ? (
              <button className="save-btn bulk-notice-run" onClick={translateStalled}>
                {stalled.length} 行を{labels.regenerate.slice(1)}
              </button>
            ) : (
              <span>
                残高 {credits} cr では足りません。
                <Link href="/account">アカウント</Link>で残高を確認してください。
              </span>
            )}
          </div>
        )}

        {/* 大量の自動翻訳は勝手に走らせず、行数と費用を見せてから */}
        {pending && (
          <div className="bulk-notice" onMouseDown={(e) => e.preventDefault()}>
            <span>
              {pending.count} 行の原文が未処理です (約 {pending.cost} cr)。
            </span>
            <button className="save-btn bulk-notice-run" onClick={approvePending}>
              {pending.count} 行を{labels.regenerate === "再翻訳" ? "翻訳" : "生成"}
            </button>
            <button className="tool-btn" onClick={dismissPending}>
              今はしない
            </button>
          </div>
        )}

        <div className="workspace">
          <Grid
            rows={rows}
            selection={selection}
            translatingIds={translatingIds}
            onCommit={commit}
            onSelect={select}
            onUndo={undo}
            onRedo={redo}
            onRetranslate={retranslate}
            onToast={showToast}
            previewTranslated={previewTranslated}
            labels={labels}
            showDiff={canDiff && showDiff}
          />
          {showStyle && (
            <StylePanel
              style={style}
              onChange={setStyle}
              onRelease={handleStyleRelease}
              onDragLength={handleDragLength}
              onClose={() => setShowStyle(false)}
              regenerateLabel={labels.regenerate}
            />
          )}
        </div>

        {isNoteSettingsOpen && (
          <div
            className="modal-overlay"
            onClick={() => setIsNoteSettingsOpen(false)}
          >
            <div
              className="modal context-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>ノート設定</h2>
                <button
                  className="close-btn"
                  onClick={() => setIsNoteSettingsOpen(false)}
                >
                  &times;
                </button>
              </div>
              <div className="modal-body">
                <section className="note-settings-section">
                  <div className="note-settings-heading">
                    <h3>
                      指示 <span className="heading-en">Prompt</span>
                    </h3>
                    <button
                      className="tool-btn"
                      onClick={() => setPromptDraft("")}
                      disabled={promptDraft.trim() === ""}
                    >
                      既定に戻す
                    </button>
                  </div>
                  <p className="modal-note">
                    右カラムを作るときの指示。空なら既定の翻訳。要約・言い換え・校正など、翻訳以外にも使えます。
                    段落ごとに独立して処理され、出力形式はこちらで固定します。
                  </p>
                  <div className="prompt-presets">
                    {PROMPT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        className="tool-btn"
                        onClick={() => setPromptDraft(preset.prompt)}
                      >
                        {preset.label}
                      </button>
                    ))}
                    {lastPrompt &&
                      lastPrompt !== prompt &&
                      !PROMPT_PRESETS.some((p) => p.prompt === lastPrompt) && (
                        <button
                          className="tool-btn"
                          title={lastPrompt}
                          onClick={() => setPromptDraft(lastPrompt)}
                        >
                          前回の指示
                        </button>
                      )}
                  </div>
                  <textarea
                    className="context-textarea prompt-textarea"
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    placeholder={DEFAULT_TASK_PROMPT}
                    rows={6}
                  />
                </section>

                <section className="note-settings-section">
                  <div className="note-settings-heading">
                    <h3>
                      背景情報 <span className="heading-en">Context</span>
                    </h3>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={autoGenerateContext}
                        onChange={(e) => setAutoGenerateContext(e.target.checked)}
                      />
                      原文から自動生成
                    </label>
                  </div>
                  <p className="modal-note">
                    文書全体の背景。翻訳の用語や調子を揃えるために毎回添えます。
                  </p>
                  <textarea
                    className="context-textarea"
                    value={contextDraft}
                    onChange={(e) => {
                      setContextDraft(e.target.value);
                      if (autoGenerateContext) setAutoGenerateContext(false);
                    }}
                    placeholder="例: SaaS 製品のリリースノート。丁寧語で。"
                    rows={3}
                  />
                </section>

                <div className="modal-actions">
                  {filledRows.length > 0 && (
                    <button
                      className="tool-btn"
                      onClick={() => handleNoteSettingsSave(true)}
                      disabled={noteSettingsSaving || !canAfford(credits, regenerateAllCost)}
                      title={
                        canAfford(credits, regenerateAllCost)
                          ? "原文のある行をすべて作り直します。手で直した行も上書きされます。"
                          : `残高 ${credits} cr では足りません (約 ${regenerateAllCost} cr 必要)`
                      }
                    >
                      保存して全 {filledRows.length} 行を
                      {outputLabels(normalizePrompt(promptDraft) !== null).regenerate}
                      {" "}(約 {regenerateAllCost} cr)
                    </button>
                  )}
                  <button
                    className="save-btn"
                    onClick={() => handleNoteSettingsSave(false)}
                    disabled={noteSettingsSaving}
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ToastContainer toasts={toasts} />
      </div>

    </>
  );
}
