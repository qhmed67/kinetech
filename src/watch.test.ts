import { describe, expect, it, vi } from "vitest";
import { MAX_VIEWS, purgeProgress, setDoneFlag, setViewsCount, watchRequirementMet } from "./watch";
import type { KtUser } from "./auth";

vi.mock("./lib/db/sync", () => ({
  pushPlayToCloud: vi.fn(),
  pushDoneToCloud: vi.fn(),
}));

const user = (views: Record<string, number>): KtUser => {
  void views;
  return { name: "T", email: "t@e.c", phone: "", enrolled: [], tracks: [], role: "student", banned: false };
};

describe("watchRequirementMet", () => {
  it("uses real media duration over the nominal label", () => {
    const u = user({});
    // 60s video: 50s watched passes, 40s does not — even though the
    // nominal label says 10min (which would demand 480s).
    expect(watchRequirementMet(u, "s", 0, 50, 60, 10)).toBe(true);
    expect(watchRequirementMet(u, "s", 0, 40, 60, 10)).toBe(false);
  });

  it("falls back to nominal minutes when duration is unknown", () => {
    const u = user({});
    expect(watchRequirementMet(u, "s", 0, 480, 0, 10)).toBe(true);
    expect(watchRequirementMet(u, "s", 0, 100, 0, 10)).toBe(false);
  });

  it("purgeProgress removes every local trace of a revoked course", () => {
    const u = user({});
    setViewsCount(u, "gone-course", 0, 3);
    setViewsCount(u, "gone-course", 1, 1);
    setViewsCount(u, "kept-course", 0, 2);
    setDoneFlag(u, "gone-course", 0);
    purgeProgress(u, "gone-course");
    expect(localStorage.getItem("kt-views")).not.toContain("gone-course");
    expect(localStorage.getItem("kt-views")).toContain("kept-course");
    expect(localStorage.getItem("kt-done") ?? "").not.toContain("gone-course");
    window.localStorage.removeItem("kt-views");
    window.localStorage.removeItem("kt-done");
  });

  it("burned views do NOT complete — only genuine watch time counts", () => {
    window.localStorage.setItem(
      "kt-views",
      JSON.stringify({ "t@e.c": { "s:0": MAX_VIEWS } }),
    );
    const u = user({});
    try {
      expect(watchRequirementMet(u, "s", 0, 0, 60, 10)).toBe(false);
      expect(watchRequirementMet(u, "s", 0, 50, 60, 10)).toBe(true);
    } finally {
      window.localStorage.removeItem("kt-views");
    }
  });
});
