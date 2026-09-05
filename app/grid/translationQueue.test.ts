import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  BULK_COST,
  BULK_ROWS,
  attemptKey,
  bulkConfirmation,
  needsTranslation,
  pendingTargets,
} from "./translationQueue";
import { applyTranslations, setCell } from "./operations";
import { COL_SOURCE, COL_TRANSLATED, createRow, type Row } from "./types";
import { translationCost } from "../domain/credits";

const anyRows = fc
  .array(
    fc.record({
      source: fc.string({ maxLength: 6 }),
      translated: fc.string({ maxLength: 6 }),
      overridden: fc.boolean(),
    }),
    { maxLength: 8 },
  )
  .map((specs): Row[] => specs.map((spec, i) => ({ id: `r${i}`, ...spec })));

/** 行と、そのうち「試行済み」に入っている部分集合、そして同じ行の並べ替え。 */
const rowsWithAttempted = anyRows.chain((rows) =>
  fc.tuple(
    fc.constant(rows),
    fc.subarray(rows).map((sub) => new Set(sub.map(attemptKey))),
    fc.shuffledSubarray(rows, {
      minLength: rows.length,
      maxLength: rows.length,
    }),
  ),
);

/**
 * 翻訳対象になる行だけを、一括確認の閾値 (行数・費用) をまたぐ規模で作る。
 * anyRows は小さすぎて確認が必要な側の枝に入らない。
 */
const targetRows = fc
  .array(
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 6 }).map((s) => (s.trim() === "" ? "x" : s)),
      fc.integer({ min: 1, max: 900 }).map((n) => "a".repeat(n)),
    ),
    { maxLength: BULK_ROWS + 5 },
  )
  .map((sources): Row[] => sources.map((source) => createRow(source)));

const targetsWithForced = targetRows.chain((rows) =>
  fc.tuple(
    fc.constant(rows),
    fc.subarray(rows).map((sub) => new Set(sub.map((row) => row.id))),
  ),
);

function ids(rows: readonly Row[]): string[] {
  return rows.map((row) => row.id).sort();
}

describe("needsTranslation", () => {
  it("picks a row with a source and no translation", () => {
    expect(
      needsTranslation({ id: "a", source: "hi", translated: "", overridden: false }),
    ).toBe(true);
  });

  it("skips a blank source, a filled translation and a hand-edited row", () => {
    expect(
      needsTranslation({ id: "a", source: "  ", translated: "", overridden: false }),
    ).toBe(false);
    expect(
      needsTranslation({ id: "a", source: "hi", translated: "やあ", overridden: false }),
    ).toBe(false);
    expect(
      needsTranslation({ id: "a", source: "hi", translated: "", overridden: true }),
    ).toBe(false);
  });
});

describe("attemptKey", () => {
  it("separates the id from the source so no two rows collide", () => {
    const a = { id: "a", source: "b c", translated: "", overridden: false };
    const b = { id: "a b", source: "c", translated: "", overridden: false };
    expect(attemptKey(a)).not.toBe(attemptKey(b));
  });
});

describe("bulkConfirmation", () => {
  it("asks for confirmation past the row threshold", () => {
    const rows = Array.from({ length: BULK_ROWS + 1 }, () => createRow("a"));
    expect(bulkConfirmation(rows, new Set())).toEqual({
      count: BULK_ROWS + 1,
      cost: BULK_ROWS + 1,
    });
  });

  it("stays quiet inside both thresholds", () => {
    expect(bulkConfirmation([createRow("a")], new Set())).toBeNull();
  });

  it("never asks about rows the user retranslated on purpose", () => {
    const rows = Array.from({ length: BULK_ROWS + 5 }, () => createRow("a"));
    expect(bulkConfirmation(rows, new Set(rows.map((row) => row.id)))).toBeNull();
  });
});

/**
 * 自動翻訳のキューは「同じ行を拾い続けない」「勝手に大量課金しない」の 2 点が
 * 壊れると気付きにくい。行の状態の組み合わせは手で並べきれないので、
 * 到達しうる行の集合を fast-check に作らせて法則を確かめる。
 */
describe("translation queue properties", () => {
  propIt.prop([rowsWithAttempted])(
    "拾うのは元の行そのもので、翻訳が要る未試行の行だけ",
    ([rows, attempted]) => {
      for (const target of pendingTargets(rows, attempted)) {
        expect(rows).toContain(target);
        expect(target.source.trim()).not.toBe("");
        expect(target.translated).toBe("");
        expect(target.overridden).toBe(false);
        expect(attempted.has(attemptKey(target))).toBe(false);
      }
    },
  );

  propIt.prop([rowsWithAttempted])(
    "拾った行を試行済みにすれば二度と拾わない (自動翻訳が回り続けない)",
    ([rows, attempted]) => {
      const targets = pendingTargets(rows, attempted);
      const next = new Set([...attempted, ...targets.map(attemptKey)]);
      expect(pendingTargets(rows, next)).toEqual([]);
    },
  );

  propIt.prop([rowsWithAttempted])("同じ入力なら何度呼んでも同じ結果", ([rows, attempted]) => {
    expect(pendingTargets(rows, attempted)).toEqual(
      pendingTargets(rows, attempted),
    );
  });

  propIt.prop([rowsWithAttempted])(
    "行の並び順は対象の選び方を変えない",
    ([rows, attempted, shuffled]) => {
      expect(ids(pendingTargets(shuffled, attempted))).toEqual(
        ids(pendingTargets(rows, attempted)),
      );
    },
  );

  propIt.prop([rowsWithAttempted])(
    "翻訳結果を反映すると対象がなくなる (自動翻訳は収束する)",
    ([rows]) => {
      const targets = pendingTargets(rows, new Set());
      const applied = applyTranslations(
        rows,
        targets.map((row) => ({
          id: row.id,
          source: row.source,
          translated: `T${row.source}`,
        })),
      );
      expect(pendingTargets(applied, new Set())).toEqual([]);
    },
  );

  propIt.prop([targetsWithForced])(
    "確認なしで走る自動翻訳は必ず上限に収まる",
    ([rows, forced]) => {
      const targets = pendingTargets(rows, new Set());
      fc.pre(bulkConfirmation(targets, forced) === null);
      fc.pre(targets.some((row) => !forced.has(row.id)));
      expect(targets.length).toBeLessThanOrEqual(BULK_ROWS);
      expect(translationCost(targets.map((row) => row.source))).toBeLessThanOrEqual(
        BULK_COST,
      );
    },
  );

  propIt.prop([targetsWithForced])(
    "明示的な再翻訳だけなら、何行あっても確認しない",
    ([rows]) => {
      const targets = pendingTargets(rows, new Set());
      expect(bulkConfirmation(targets, new Set(targets.map((row) => row.id)))).toBeNull();
    },
  );

  propIt.prop([rowsWithAttempted])(
    "対象の原文は必ず中身があるので、費用は件数を下回らない",
    ([rows, attempted]) => {
      const targets = pendingTargets(rows, attempted);
      expect(translationCost(targets.map((row) => row.source))).toBeGreaterThanOrEqual(
        targets.length,
      );
    },
  );

  propIt.prop([anyRows, fc.nat({ max: 7 }), fc.string({ maxLength: 6 })])(
    "原文を書き換えた行は必ず翻訳の対象に戻る",
    (rows, at, text) => {
      fc.pre(rows.length > 0 && text.trim() !== "");
      const index = at % rows.length;
      fc.pre(rows[index].source !== text);
      const next = setCell(rows, index, COL_SOURCE, text);
      expect(ids(pendingTargets(next, new Set()))).toContain(next[index].id);
    },
  );

  propIt.prop([anyRows, fc.nat({ max: 7 }), fc.string({ maxLength: 6 })])(
    "訳文を手で書いた行は自動翻訳の対象にならない",
    (rows, at, text) => {
      fc.pre(rows.length > 0 && text.trim() !== "");
      const index = at % rows.length;
      const next = setCell(rows, index, COL_TRANSLATED, text);
      expect(ids(pendingTargets(next, new Set()))).not.toContain(next[index].id);
    },
  );
});
