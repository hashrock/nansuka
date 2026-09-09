import { describe, expect, it } from "vitest";
import { INITIAL_CREDITS } from "../db/schema";
import { normalizePrompt } from "../domain/prompt";
import { parseRows, serializeRows } from "../grid/rowsCodec";
import type { SessionUser } from "../user";
import {
  FRESH_USER_REASON,
  SCENARIOS,
  SUFFIX_LENGTH,
  findScenario,
  randomSuffix,
  resolveActor,
  scenarioLabel,
  wantsJson,
} from "./registry";
import { targetUrl } from "./apply";
import { LARGE_LIST_COUNT, LARGE_ROW_COUNT, LONG_PARAGRAPH_LENGTH } from "./large";
import { LEDGER_ENTRY_COUNT } from "./ledger";
import type { LedgerPlan } from "./types";

const LABEL = "scenario-test-abc123";

function balanceAfter(ledger: LedgerPlan[]): number {
  return ledger.reduce(
    (total, e) => (e.kind === "spend" ? total - e.amount : total + e.amount),
    INITIAL_CREDITS,
  );
}

describe("registry", () => {
  it("has between 3 and 6 scenarios with unique url-safe names", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(3);
    expect(SCENARIOS.length).toBeLessThanOrEqual(6);
    const names = SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z-]*$/);
    for (const required of ["empty", "typical", "large"]) {
      expect(findScenario(required)).toBeDefined();
    }
    expect(findScenario("nope")).toBeUndefined();
  });

  it("makes short random suffixes and labels", () => {
    const suffix = randomSuffix();
    expect(suffix).toMatch(new RegExp(`^[a-z0-9]{${SUFFIX_LENGTH}}$`));
    expect(randomSuffix()).not.toBe(suffix);
    expect(scenarioLabel("typical", "ab12cd")).toBe("scenario-typical-ab12cd");
  });

  it("detects json requests from the query or the accept header", () => {
    expect(wantsJson("json", undefined)).toBe(true);
    expect(wantsJson(undefined, "application/json")).toBe(true);
    expect(wantsJson(undefined, "text/html, application/json;q=0.9")).toBe(true);
    expect(wantsJson(undefined, "text/html")).toBe(false);
    expect(wantsJson(undefined, undefined)).toBe(false);
  });
});

describe("plans", () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      const plan = scenario.build(LABEL);

      it("tags every note with the label", () => {
        for (const note of plan.notes) expect(note.title.startsWith(LABEL)).toBe(true);
      });

      it("stores rows in a form the grid can read back", () => {
        for (const note of plan.notes) {
          const rows = parseRows(serializeRows(note.rows));
          expect(rows.length).toBe(Math.max(1, note.rows.length));
          for (const [i, row] of note.rows.entries()) {
            expect(rows[i].source).toBe(row.source);
            expect(rows[i].translated).toBe(row.translated);
            expect(rows[i].overridden).toBe(row.overridden);
          }
        }
      });

      it("never spends more than the initial grant", () => {
        let balance = INITIAL_CREDITS;
        for (const entry of plan.ledger) {
          balance += entry.kind === "spend" ? -entry.amount : entry.amount;
          expect(entry.amount).toBeGreaterThan(0);
          expect(balance).toBeGreaterThanOrEqual(0);
        }
      });

      it("points its redirect at something the plan creates", () => {
        if (plan.target.kind === "note") {
          expect(plan.notes[plan.target.index]).toBeDefined();
        }
      });

      it("requires a fresh user when there is nothing to show without one", () => {
        // ノートが無い、または台帳が主役 (ノートより多い) なら本人の
        // アカウントでは再現できない。
        if (plan.notes.length === 0 || plan.ledger.length > plan.notes.length) {
          expect(scenario.requiresFreshUser).toBe(true);
        }
      });
    });
  }

  it("empty creates nothing and lands on the notes list", () => {
    const plan = findScenario("empty")!.build(LABEL);
    expect(findScenario("empty")!.requiresFreshUser).toBe(true);
    expect(plan.notes).toHaveLength(0);
    expect(plan.ledger).toHaveLength(0);
    expect(plan.target).toEqual({ kind: "notes" });
  });

  it("typical mixes translated, overridden and untranslated rows across a few notes", () => {
    const plan = findScenario("typical")!.build(LABEL);
    expect(plan.notes.length).toBeGreaterThanOrEqual(2);
    expect(plan.notes.length).toBeLessThanOrEqual(5);
    const rows = plan.notes.flatMap((n) => n.rows);
    expect(rows.some((r) => r.translated && !r.overridden)).toBe(true);
    expect(rows.some((r) => r.overridden)).toBe(true);
    expect(rows.some((r) => r.source && !r.translated)).toBe(true);
  });

  it("large has many rows, a very long paragraph and a crowded list", () => {
    const plan = findScenario("large")!.build(LABEL);
    expect(plan.notes.length).toBe(1 + LARGE_LIST_COUNT);
    const big = plan.notes[0];
    expect(big.rows.length).toBe(LARGE_ROW_COUNT);
    expect(big.rows.some((r) => r.source.length >= LONG_PARAGRAPH_LENGTH)).toBe(true);
    expect(big.rows.some((r) => r.translated.length >= LONG_PARAGRAPH_LENGTH)).toBe(true);
    expect(big.rows.some((r) => r.source.includes("\n"))).toBe(true);
    expect(plan.target).toEqual({ kind: "note", index: 0 });
  });

  it("custom-prompt sets a prompt the server would keep", () => {
    const plan = findScenario("custom-prompt")!.build(LABEL);
    const note = plan.notes[0];
    expect(normalizePrompt(note.prompt)).toBe(note.prompt);
    expect(note.prompt).not.toBeNull();
  });

  it("no-credits drains the balance to exactly zero", () => {
    expect(findScenario("no-credits")!.requiresFreshUser).toBe(true);
    const plan = findScenario("no-credits")!.build(LABEL);
    expect(balanceAfter(plan.ledger)).toBe(0);
    expect(plan.notes[0].rows.every((r) => r.translated === "")).toBe(true);
  });

  it("ledger has a long mixed history and opens the account page", () => {
    expect(findScenario("ledger")!.requiresFreshUser).toBe(true);
    const plan = findScenario("ledger")!.build(LABEL);
    expect(plan.ledger.length).toBeGreaterThanOrEqual(LEDGER_ENTRY_COUNT);
    const reasons = new Set(plan.ledger.map((e) => e.reason));
    expect(reasons).toContain("translate");
    expect(reasons).toContain("context");
    expect(reasons).toContain("translate:refund");
    expect(balanceAfter(plan.ledger)).toBeGreaterThan(0);
    expect(plan.target).toEqual({ kind: "account" });
  });
});

describe("resolveActor", () => {
  const user: SessionUser = { id: "u1", email: "u@example.com", name: "U", avatarUrl: "" };
  const fresh = findScenario("empty")!;
  const shared = findScenario("typical")!;

  it("always makes a fresh user when the dev bypass is on", () => {
    expect(resolveActor(fresh, true, null)).toEqual({ kind: "fresh" });
    expect(resolveActor(shared, true, user)).toEqual({ kind: "fresh" });
  });

  it("sends anonymous visitors to log in", () => {
    expect(resolveActor(shared, false, null)).toEqual({ kind: "login-required" });
  });

  it("uses the logged-in account only for scenarios that do not touch the balance", () => {
    expect(resolveActor(shared, false, user)).toEqual({ kind: "own", user });
    expect(resolveActor(fresh, false, user)).toEqual({
      kind: "unavailable",
      reason: FRESH_USER_REASON,
    });
  });
});

describe("targetUrl", () => {
  const notes = [{ id: "n1", title: "t", url: "/notes/n1" }];
  it("maps targets to app routes", () => {
    expect(targetUrl({ kind: "notes" }, notes)).toBe("/notes");
    expect(targetUrl({ kind: "account" }, notes)).toBe("/account");
    expect(targetUrl({ kind: "note", index: 0 }, notes)).toBe("/notes/n1");
    expect(targetUrl({ kind: "note", index: 5 }, notes)).toBe("/notes");
  });
});
