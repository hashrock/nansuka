import { describe, expect, it } from "vitest";
import {
  clampSelection,
  moveCell,
  moveCellWrapping,
  rectContains,
  selectAll,
  selectRow,
  singleCell,
  toRect,
} from "./selection";

describe("toRect", () => {
  it("normalises a selection dragged upward and leftward", () => {
    expect(
      toRect({ anchor: { row: 3, col: 1 }, focus: { row: 1, col: 0 } }),
    ).toEqual({ top: 1, bottom: 3, left: 0, right: 1 });
  });
});

describe("rectContains", () => {
  const rect = { top: 1, bottom: 2, left: 0, right: 0 };

  it("includes cells inside the rectangle", () => {
    expect(rectContains(rect, 1, 0)).toBe(true);
    expect(rectContains(rect, 2, 0)).toBe(true);
  });

  it("excludes cells outside it", () => {
    expect(rectContains(rect, 0, 0)).toBe(false);
    expect(rectContains(rect, 1, 1)).toBe(false);
  });
});

describe("moveCell", () => {
  it("stops at the edges instead of wrapping", () => {
    expect(moveCell({ row: 0, col: 0 }, -1, 0, 3)).toEqual({ row: 0, col: 0 });
    expect(moveCell({ row: 2, col: 1 }, 1, 1, 3)).toEqual({ row: 2, col: 1 });
  });

  it("moves within bounds", () => {
    expect(moveCell({ row: 0, col: 0 }, 1, 1, 3)).toEqual({ row: 1, col: 1 });
  });
});

describe("moveCellWrapping", () => {
  it("wraps to the next row at the end of a row", () => {
    expect(moveCellWrapping({ row: 0, col: 1 }, 1, 3)).toEqual({
      row: 1,
      col: 0,
    });
  });

  it("wraps backwards to the previous row", () => {
    expect(moveCellWrapping({ row: 1, col: 0 }, -1, 3)).toEqual({
      row: 0,
      col: 1,
    });
  });

  it("stays put at the very start and the very end", () => {
    expect(moveCellWrapping({ row: 0, col: 0 }, -1, 3)).toEqual({
      row: 0,
      col: 0,
    });
    expect(moveCellWrapping({ row: 2, col: 1 }, 1, 3)).toEqual({
      row: 2,
      col: 1,
    });
  });
});

describe("selectRow / selectAll", () => {
  it("spans both columns of one row", () => {
    expect(toRect(selectRow(2))).toEqual({
      top: 2,
      bottom: 2,
      left: 0,
      right: 1,
    });
  });

  it("spans the whole grid", () => {
    expect(toRect(selectAll(4))).toEqual({
      top: 0,
      bottom: 3,
      left: 0,
      right: 1,
    });
  });
});

describe("clampSelection", () => {
  it("pulls a selection back inside a shrunken grid", () => {
    const clamped = clampSelection(
      { anchor: { row: 5, col: 0 }, focus: { row: 7, col: 1 } },
      3,
    );
    expect(toRect(clamped)).toEqual({ top: 2, bottom: 2, left: 0, right: 1 });
  });

  it("leaves a valid selection alone", () => {
    const selection = singleCell({ row: 1, col: 1 });
    expect(clampSelection(selection, 3)).toEqual(selection);
  });
});
