import { describe, expect, it } from "vitest";
import { parsePlaybackResult } from "@kinetech/bridge";

const grant = {
  url: "https://cdn.example.com/lesson.mp4?token=short-lived",
  expiresAt: "2026-11-11T20:00:00.000Z",
  email: "student@example.com",
  phoneLast4: "1234",
  minutes: 12,
  viewsLeft: 2,
  deviceId: "11111111-2222-3333-4444-555555555555",
};

describe("playback grant validation", () => {
  it("accepts a complete grant", () => {
    const result = parsePlaybackResult({ ok: true, grant });
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.grant.url).toBe(grant.url);
      expect(result.grant.viewsLeft).toBe(2);
    }
  });

  it("rejects a grant without a usable url", () => {
    expect(parsePlaybackResult({ ok: true, grant: { ...grant, url: "" } })).toBeNull();
    expect(parsePlaybackResult({ ok: true, grant: { ...grant, url: 42 } })).toBeNull();
    expect(parsePlaybackResult({ ok: true })).toBeNull();
    expect(parsePlaybackResult({ ok: true, grant: null })).toBeNull();
  });

  it("rejects a grant with wrong field types", () => {
    expect(parsePlaybackResult({ ok: true, grant: { ...grant, minutes: "12" } })).toBeNull();
    expect(parsePlaybackResult({ ok: true, grant: { ...grant, viewsLeft: null } })).toBeNull();
    expect(parsePlaybackResult({ ok: true, grant: { ...grant, expiresAt: 1 } })).toBeNull();
  });

  it("keeps a denial as a denial (student-facing copy only)", () => {
    const result = parsePlaybackResult({
      ok: false,
      code: "NOT_ENROLLED",
      ar: "غير مسجل في هذا الكورس.",
      en: "Not enrolled in this course.",
    });
    expect(result).toEqual({
      ok: false,
      code: "NOT_ENROLLED",
      ar: "غير مسجل في هذا الكورس.",
      en: "Not enrolled in this course.",
    });
  });

  it("never invents a grant from a broken payload", () => {
    expect(parsePlaybackResult("not json")).toBeNull();
    expect(parsePlaybackResult(null)).toBeNull();
    expect(parsePlaybackResult({})).toBeNull();
    expect(parsePlaybackResult({ ok: "yes" })).toBeNull();
  });
});
