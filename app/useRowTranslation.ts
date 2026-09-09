import { useCallback, useEffect, useRef, useState } from "react";
import { translateParagraphs } from "./api";
import { simpleHash } from "./utils";
import {
  getCachedTranslation,
  setCachedTranslation,
} from "./useTranslationCache";
import { applyTranslations } from "./grid/operations";
import {
  attemptKey,
  bulkConfirmation,
  pendingTargets,
  type BulkConfirmation,
} from "./grid/translationQueue";
import type { Row } from "./grid/types";
import { styleCacheKey, type StyleParams } from "./domain/style";

/** 1リクエストにまとめる行数。貼り付けで数百行入っても分割して投げる。 */
const BATCH_SIZE = 20;
/** 連続した確定・貼り付けを1回のリクエストに束ねるための待ち時間。 */
const COALESCE_MS = 150;

interface Options {
  rows: Row[];
  patch: (update: (rows: Row[]) => Row[]) => void;
  /**
   * 履歴に積む更新。明示的な再翻訳で訳文を消す操作はユーザーの意思なので、
   * Cmd+Z で元の訳文に戻せるようにこちらを使う。省略時は patch。
   */
  commit?: (rows: Row[]) => void;
  contextRef: React.RefObject<string>;
  /** 文章調整の現在値。キャッシュキーとリクエストの両方に使う。 */
  styleRef: React.RefObject<StyleParams>;
  /** ノート固有のプロンプト。null なら既定の翻訳。 */
  promptRef: React.RefObject<string | null>;
  noteId: string;
  /** サーバーが返した残高をヘッダー表示に反映するための通知。 */
  onCredits?: (credits: number) => void;
  /**
   * false なら未翻訳の行を勝手に訳さない (明示的な「再翻訳」だけ通す)。
   * 開いただけでクレジットが減らない画面を UI テストで作るために使う。
   */
  autoTranslate?: boolean;
}

export function useRowTranslation({
  rows,
  patch,
  commit,
  contextRef,
  styleRef,
  promptRef,
  noteId,
  onCredits,
  autoTranslate = true,
}: Options) {
  const [error, setError] = useState("");
  const [translatingIds, setTranslatingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  /** 確認待ちの大量翻訳。null なら待ちなし。 */
  const [pending, setPending] = useState<BulkConfirmation | null>(null);
  const pendingIdsRef = useRef<Set<string>>(new Set());

  const attemptedRef = useRef(new Set<string>());
  /** 明示的に「再翻訳」された行。キャッシュを読まずに必ず API へ出す。 */
  const forcedRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onCreditsRef = useRef(onCredits);
  onCreditsRef.current = onCredits;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const markTranslating = useCallback((ids: string[], active: boolean) => {
    setTranslatingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (active) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const run = useCallback(
    async (targets: Row[]) => {
      const ids = targets.map((r) => r.id);
      markTranslating(ids, true);

      try {
        const style = styleRef.current;
        const prompt = promptRef.current;
        const context = contextRef.current;
        // 結果を左右する入力 (原文・文章調整・プロンプト・コンテキスト) を
        // すべてキーに含める。どれかを変えたら別の結果として扱う。
        const promptKey = prompt ? `|P${simpleHash(prompt)}` : "";
        const contextKey = context ? `|X${simpleHash(context)}` : "";
        const cacheKey = (source: string) =>
          simpleHash(source + styleCacheKey(style) + promptKey + contextKey);
        // まずキャッシュ。過去に訳した段落はネットワークに出ない。
        // ただし明示的な再翻訳は「訳し直してほしい」の意思表示なので通さない。
        const cached: { id: string; source: string; translated: string }[] = [];
        const misses: Row[] = [];
        await Promise.all(
          targets.map(async (row) => {
            const forced = forcedRef.current.delete(row.id);
            const hit = forced ? null : await getCachedTranslation(cacheKey(row.source));
            if (hit) cached.push({ id: row.id, source: row.source, translated: hit });
            else misses.push(row);
          }),
        );

        if (cached.length > 0) {
          patch((current) => applyTranslations(current, cached));
          markTranslating(
            cached.map((c) => c.id),
            false,
          );
        }

        if (misses.length === 0) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        for (let i = 0; i < misses.length; i += BATCH_SIZE) {
          const batch = misses.slice(i, i + BATCH_SIZE);
          const { results, credits } = await translateParagraphs(
            batch.map((row, index) => ({ index, text: row.source })),
            {
              context: contextRef.current,
              noteId,
              signal: controller.signal,
              style,
              prompt,
            },
          );
          if (typeof credits === "number") onCreditsRef.current?.(credits);

          const applied = results
            .map((result) => {
              const row = batch[result.index];
              if (!row || !result.translated) return null;
              void setCachedTranslation(cacheKey(row.source), result.translated);
              return {
                id: row.id,
                source: row.source,
                translated: result.translated,
              };
            })
            .filter((r): r is { id: string; source: string; translated: string } =>
              r !== null,
            );

          patch((current) => applyTranslations(current, applied));
          markTranslating(
            batch.map((row) => row.id),
            false,
          );
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Translation failed");
      } finally {
        markTranslating(ids, false);
      }
    },
    [patch, contextRef, styleRef, promptRef, noteId, markTranslating],
  );

  useEffect(() => {
    const targets = pendingTargets(rows, attemptedRef.current).filter(
      (row) => autoTranslate || forcedRef.current.has(row.id),
    );
    if (targets.length === 0) {
      if (pendingIdsRef.current.size > 0) {
        pendingIdsRef.current = new Set();
        setPending(null);
      }
      return;
    }

    const confirmation = bulkConfirmation(targets, forcedRef.current);
    if (confirmation) {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingIdsRef.current = new Set(targets.map((row) => row.id));
      setPending(confirmation);
      return;
    }
    if (pendingIdsRef.current.size > 0) {
      pendingIdsRef.current = new Set();
      setPending(null);
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fresh = pendingTargets(rowsRef.current, attemptedRef.current).filter(
        (row) => autoTranslate || forcedRef.current.has(row.id),
      );
      if (fresh.length === 0) return;
      for (const row of fresh) attemptedRef.current.add(attemptKey(row));
      setError("");
      void run(fresh);
    }, COALESCE_MS);
  }, [rows, run, autoTranslate]);

  /** 手動編集や失敗した行を、もう一度翻訳の対象に戻す。 */
  const retranslate = useCallback(
    (ids: string[]) => {
      const targeted = new Set(ids);
      for (const id of ids) forcedRef.current.add(id);
      const clear = (current: Row[]) =>
        current.map((row) => {
          if (!targeted.has(row.id)) return row;
          attemptedRef.current.delete(attemptKey(row));
          return { ...row, translated: "", overridden: false };
        });
      if (commit) commit(clear(rowsRef.current));
      else patch(clear);
    },
    [patch, commit],
  );

  /** 確認待ちの大量翻訳を実行する。 */
  const approvePending = useCallback(() => {
    const ids = pendingIdsRef.current;
    pendingIdsRef.current = new Set();
    setPending(null);
    // 確認した行に絞ってから翻訳要否を見る (安いほうの判定を先に通す)。
    const fresh = pendingTargets(
      rowsRef.current.filter((row) => ids.has(row.id)),
      attemptedRef.current,
    );
    if (fresh.length === 0) return;
    for (const row of fresh) attemptedRef.current.add(attemptKey(row));
    setError("");
    void run(fresh);
  }, [run]);

  /** 確認待ちを見送る。その行は「再翻訳」で改めて頼めるようにしておく。 */
  const dismissPending = useCallback(() => {
    const ids = pendingIdsRef.current;
    pendingIdsRef.current = new Set();
    setPending(null);
    for (const row of rowsRef.current) {
      if (ids.has(row.id)) attemptedRef.current.add(attemptKey(row));
    }
  }, []);

  return {
    error,
    setError,
    translatingIds,
    retranslate,
    pending,
    approvePending,
    dismissPending,
  };
}
