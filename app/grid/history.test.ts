import { fc, it as propIt } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  type HistoryAction,
  type HistoryState,
  type Snapshot,
  canRedo,
  canUndo,
  historyReducer,
  initHistory,
} from "./history";
import { createRow, type Selection } from "./types";

/** 毎回別のオブジェクトを返す。実際の呼び出し側も新しい選択を渡す。 */
function sel(row: number): Selection {
  return { anchor: { row, col: 0 }, focus: { row, col: 0 } };
}

/**
 * アクション列を組み立てるための操作。reducer は rows を参照で比較するので、
 * 「行を変える」「行は変えない」を区別できるよう別々の操作にしてある。
 */
const COMMANDS = [
  "commit",
  "commitWithoutSelection",
  "reselectCommit",
  "select",
  "patch",
  "patchNoop",
  "undo",
  "redo",
] as const;
type Command = (typeof COMMANDS)[number];

function step(state: HistoryState, command: Command): HistoryState {
  const rowCount = state.present.rows.length;
  switch (command) {
    case "commit":
      return historyReducer(state, {
        type: "commit",
        rows: [...state.present.rows, createRow()],
        selection: sel(rowCount),
      });
    case "commitWithoutSelection":
      return historyReducer(state, {
        type: "commit",
        rows: [...state.present.rows, createRow()],
      });
    // 行はそのままで選択だけ動かす確定 (ドラッグ選択など)。
    case "reselectCommit":
      return historyReducer(state, {
        type: "commit",
        rows: state.present.rows,
        selection: sel(rowCount - 1),
      });
    case "select":
      return historyReducer(state, { type: "select", selection: sel(0) });
    case "patch":
      return historyReducer(state, {
        type: "patch",
        update: (rows) => [...rows, createRow()],
      });
    case "patchNoop":
      return historyReducer(state, { type: "patch", update: (rows) => rows });
    case "undo":
      return historyReducer(state, { type: "undo" });
    case "redo":
      return historyReducer(state, { type: "redo" });
  }
}

function start(): HistoryState {
  return initHistory({ rows: [createRow()], selection: sel(0) });
}

function run(script: Command[]): HistoryState {
  return script.reduce(step, start());
}

function repeat(
  state: HistoryState,
  action: HistoryAction,
  times: number,
): HistoryState {
  let current = state;
  for (let i = 0; i < times; i++) current = historyReducer(current, action);
  return current;
}

/** past → present → future を1本に並べたもの。undo/redo はこの上の位置を動かすだけ。 */
function timeline(state: HistoryState): Snapshot[] {
  return [...state.past, state.present, ...state.future];
}

const script = fc.array(fc.constantFrom(...COMMANDS), { maxLength: 30 });

describe("historyReducer", () => {
  it("starts with nothing to undo or redo", () => {
    const state = start();
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it("pushes the previous snapshot when the rows change", () => {
    const state = run(["commit"]);
    expect(state.past).toHaveLength(1);
    expect(canUndo(state)).toBe(true);
  });

  it("does not push history for a selection-only commit", () => {
    const state = run(["reselectCommit"]);
    expect(state.past).toHaveLength(0);
  });

  it("drops the redo stack once a new edit is made", () => {
    const state = run(["commit", "commit", "undo", "commit"]);
    expect(state.future).toEqual([]);
  });
});

/**
 * Undo/Redo は「アクション列を通した結果」でしか壊れ方が見えない。
 * 個別のケースを並べる代わりに、任意の操作列を流し込んで法則を確かめる。
 */
describe("history properties", () => {
  propIt.prop([script])(
    "undo と redo はタイムラインを変えず、位置だけを動かす",
    (commands) => {
      const state = run(commands);

      if (canUndo(state)) {
        const after = historyReducer(state, { type: "undo" });
        expect(timeline(after)).toEqual(timeline(state));
        expect(after.past.length).toBe(state.past.length - 1);
      }
      if (canRedo(state)) {
        const after = historyReducer(state, { type: "redo" });
        expect(timeline(after)).toEqual(timeline(state));
        expect(after.past.length).toBe(state.past.length + 1);
      }
    },
  );

  propIt.prop([script])("undo のあとの redo は元の状態に戻す", (commands) => {
    const state = run(commands);
    fc.pre(canUndo(state));
    const roundTrip = historyReducer(historyReducer(state, { type: "undo" }), {
      type: "redo",
    });
    expect(roundTrip).toEqual(state);
  });

  propIt.prop([script])("redo のあとの undo は元の状態に戻す", (commands) => {
    const state = run(commands);
    fc.pre(canRedo(state));
    const roundTrip = historyReducer(historyReducer(state, { type: "redo" }), {
      type: "undo",
    });
    expect(roundTrip).toEqual(state);
  });

  propIt.prop([script])(
    "履歴を全部たどって戻ってくると元の状態に一致する",
    (commands) => {
      const state = run(commands);
      const depth = state.past.length;
      const rewound = repeat(state, { type: "undo" }, depth);
      expect(rewound.past).toEqual([]);
      expect(repeat(rewound, { type: "redo" }, depth)).toEqual(state);
    },
  );

  propIt.prop([script])(
    "select と patch は履歴の前後を一切動かさない",
    (commands) => {
      const state = run(commands);
      for (const command of ["select", "patch", "patchNoop", "reselectCommit"] as const) {
        const after = step(state, command);
        expect(after.past).toBe(state.past);
        expect(after.future).toBe(state.future);
      }
    },
  );

  propIt.prop([script])("何も変わらないアクションは同じ状態を返す", (commands) => {
    const state = run(commands);

    expect(
      historyReducer(state, { type: "patch", update: (rows) => rows }),
    ).toBe(state);
    expect(
      historyReducer(state, { type: "select", selection: state.present.selection }),
    ).toBe(state);
    expect(
      historyReducer(state, { type: "commit", rows: state.present.rows }),
    ).toBe(state);
    if (!canUndo(state)) {
      expect(historyReducer(state, { type: "undo" })).toBe(state);
    }
    if (!canRedo(state)) {
      expect(historyReducer(state, { type: "redo" })).toBe(state);
    }
  });

  propIt.prop([script])(
    "行を変える commit のあとは必ず undo でき、redo は消えている",
    (commands) => {
      const after = step(run(commands), "commit");
      expect(canUndo(after)).toBe(true);
      expect(after.future).toEqual([]);
    },
  );

  propIt.prop([script])(
    "タイムライン上で隣り合う状態は必ず行が違う (undo が空振りしない)",
    (commands) => {
      const entries = timeline(run(commands));
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].rows).not.toBe(entries[i - 1].rows);
      }
    },
  );

  propIt.prop([fc.nat({ max: 20 })])(
    "履歴は上限を超えて伸びない",
    (extra) => {
      const state = run(Array<Command>(HISTORY_LIMIT + extra).fill("commit"));
      expect(state.past.length).toBe(HISTORY_LIMIT);
    },
  );

  propIt.prop([script])("履歴は常に上限以内に収まる", (commands) => {
    expect(run(commands).past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });
});
