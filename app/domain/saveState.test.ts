import { describe, expect, it } from "vitest";
import {
  canRetrySave,
  classifySaveFailure,
  saveFailureAdvice,
  saveFailureMessage,
} from "./saveState";

describe("classifySaveFailure", () => {
  it("maps HTTP statuses to a failure kind", () => {
    expect(classifySaveFailure(401)).toBe("unauthorized");
    expect(classifySaveFailure(404)).toBe("not-found");
    expect(classifySaveFailure(500)).toBe("server");
    expect(classifySaveFailure(400)).toBe("server");
  });

  it("treats a missing status (fetch threw) as a network failure", () => {
    expect(classifySaveFailure(null)).toBe("network");
  });
});

describe("save failure copy", () => {
  it("explains what happened, not just that it failed", () => {
    expect(saveFailureMessage("not-found")).toContain("別のアカウント");
    expect(saveFailureMessage("unauthorized")).toContain("ログイン");
  });

  it("always tells the user their text is kept in the browser", () => {
    for (const failure of ["unauthorized", "not-found", "server", "network"] as const) {
      expect(saveFailureAdvice(failure)).toContain("このブラウザに残しています");
    }
  });

  it("offers retry only where retrying can help", () => {
    expect(canRetrySave("server")).toBe(true);
    expect(canRetrySave("network")).toBe(true);
    expect(canRetrySave("unauthorized")).toBe(false);
    expect(canRetrySave("not-found")).toBe(false);
  });
});
