import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { navigate, type KeyChord } from "./navigation";
import { cellsEqual, isSingleCell, singleCell, toRect } from "./selection";
import { COL_COUNT, type Selection } from "./types";

const NAV_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Tab",
  "Home",
  "End",
  "Escape",
] as const;

/** 移動に関わらないキーも混ぜて、担当外が素通りすることまで見る。 */
const OTHER_KEYS = ["Enter", "F2", "Delete", "Backspace", "a", "z", "1"] as const;

const chord = fc.record({
  key: fc.constantFrom(...NAV_KEYS, ...OTHER_KEYS),
  shift: fc.boolean(),
  mod: fc.boolean(),
});
const chords = fc.array(chord, { maxLength: 20 });
const rowCount = fc.integer({ min: 1, max: 6 });

/** 担当外のキーは選択を変えない、という前提でキー列を流す。 */
function run(
  start: Selection,
  script: KeyChord[],
  rows: number,
): Selection {
  return script.reduce(
    (selection, c) => navigate(selection, c, rows) ?? selection,
    start,
  );
}

function inBounds(selection: Selection, rows: number): boolean {
  const rect = toRect(selection);
  return (
    rect.top >= 0 &&
    rect.bottom < rows &&
    rect.left >= 0 &&
    rect.right < COL_COUNT
  );
}

describe("navigate", () => {
  const at = (row: number, col: number) => singleCell({ row, col });

  it("moves with the arrow keys and stops at the edges", () => {
    expect(navigate(at(0, 0), { key: "ArrowDown", shift: false, mod: false }, 3))
      .toEqual(at(1, 0));
    expect(navigate(at(0, 0), { key: "ArrowUp", shift: false, mod: false }, 3))
      .toEqual(at(0, 0));
  });

  it("extends the selection with shift, keeping the anchor", () => {
    const extended = navigate(at(1, 0), { key: "ArrowDown", shift: true, mod: false }, 3);
    expect(extended).toEqual({ anchor: { row: 1, col: 0 }, focus: { row: 2, col: 0 } });
  });

  it("wraps with Tab and never extends", () => {
    expect(navigate(at(0, COL_COUNT - 1), { key: "Tab", shift: false, mod: false }, 3))
      .toEqual(at(1, 0));
    expect(navigate(at(1, 0), { key: "Tab", shift: true, mod: false }, 3))
      .toEqual(at(0, COL_COUNT - 1));
  });

  it("collapses to the focused cell on Escape", () => {
    const range = { anchor: { row: 0, col: 0 }, focus: { row: 2, col: 1 } };
    expect(navigate(range, { key: "Escape", shift: false, mod: false }, 3))
      .toEqual(at(2, 1));
  });

  it("selects the whole grid with the modifier and A", () => {
    expect(toRect(navigate(at(0, 0), { key: "a", shift: false, mod: true }, 3)!))
      .toEqual({ top: 0, bottom: 2, left: 0, right: COL_COUNT - 1 });
  });

  it("leaves other modifier combos to the browser", () => {
    for (const key of ["c", "v", "z", "ArrowDown"]) {
      expect(navigate(at(0, 0), { key, shift: false, mod: true }, 3)).toBeNull();
    }
  });

  it("does not claim keys it is not responsible for", () => {
    for (const key of ["Enter", "F2", "Delete", "Backspace", "x"]) {
      expect(navigate(at(0, 0), { key, shift: false, mod: false }, 3)).toBeNull();
    }
  });
});

/**
 * キーは列で押される。1回ずつの確認では、端やタブ折り返しをまたいだ
 * 組み合わせで選択がグリッドの外に出ないことまでは言えない。
 */
describe("navigation properties", () => {
  propIt.prop([rowCount, chords])(
    "どんなキー列を流しても選択はグリッドの中に留まる",
    (rows, script) => {
      let selection = singleCell({ row: 0, col: 0 });
      for (const c of script) {
        selection = navigate(selection, c, rows) ?? selection;
        expect(inBounds(selection, rows)).toBe(true);
      }
    },
  );

  propIt.prop([rowCount, chords, chord])(
    "shift なしの移動は必ず単一セルに畳まれる",
    (rows, script, last) => {
      // Ctrl+A は範囲を選ぶための操作なので対象外。
      fc.pre(!last.shift && !last.mod);
      const next = navigate(run(singleCell({ row: 0, col: 0 }), script, rows), last, rows);
      fc.pre(next !== null);
      expect(isSingleCell(next)).toBe(true);
    },
  );

  propIt.prop([rowCount, chords, fc.constantFrom(...NAV_KEYS)])(
    "shift 付きの移動は anchor を動かさない",
    (rows, script, key) => {
      // Tab と Escape は範囲を広げない操作なので対象外。
      fc.pre(key !== "Tab" && key !== "Escape");
      const before = run(singleCell({ row: 0, col: 0 }), script, rows);
      const after = navigate(before, { key, shift: true, mod: false }, rows);
      expect(after?.anchor).toEqual(before.anchor);
    },
  );

  propIt.prop([rowCount, chords])(
    "担当外のキーは選択に触らない",
    (rows, script) => {
      const before = run(singleCell({ row: 0, col: 0 }), script, rows);
      for (const key of OTHER_KEYS) {
        expect(navigate(before, { key, shift: false, mod: false }, rows)).toBeNull();
      }
    },
  );

  propIt.prop([rowCount, chords])(
    "修飾キー付きで受け持つのは「すべて選択」だけ",
    (rows, script) => {
      const before = run(singleCell({ row: 0, col: 0 }), script, rows);
      for (const key of [...NAV_KEYS, ...OTHER_KEYS]) {
        const next = navigate(before, { key, shift: false, mod: true }, rows);
        if (key.toLowerCase() === "a") {
          expect(toRect(next!)).toEqual({
            top: 0,
            bottom: rows - 1,
            left: 0,
            right: COL_COUNT - 1,
          });
        } else {
          expect(next).toBeNull();
        }
      }
    },
  );

  propIt.prop([rowCount, chords])(
    "Escape は focus を残したまま範囲を畳む",
    (rows, script) => {
      const before = run(singleCell({ row: 0, col: 0 }), script, rows);
      const after = navigate(before, { key: "Escape", shift: false, mod: false }, rows);
      expect(after).toEqual(singleCell(before.focus));
    },
  );

  propIt.prop([rowCount, chords])(
    "Tab で進んで Shift+Tab で戻ると元のセルに帰る",
    (rows, script) => {
      const before = run(singleCell({ row: 0, col: 0 }), script, rows);
      const forward = navigate(before, { key: "Tab", shift: false, mod: false }, rows)!;
      // 末尾で止まったときは戻る先がないので除く。
      fc.pre(!cellsEqual(forward.focus, before.focus));
      const back = navigate(forward, { key: "Tab", shift: true, mod: false }, rows)!;
      expect(back.focus).toEqual(before.focus);
    },
  );
});
