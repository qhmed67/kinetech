import { describe, expect, it, vi } from "vitest";
import { markSessionsSeen, readSeenSessionsIso, SESSIONS_SEEN_EVENT } from "./seen";

describe("sessions seen marker", () => {
  it("starts null and round-trips an ISO stamp", () => {
    window.localStorage.clear();
    expect(readSeenSessionsIso()).toBeNull();
    markSessionsSeen("2026-01-01T00:00:00.000Z");
    expect(readSeenSessionsIso()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("dispatches the seen event so chrome recounts", () => {
    const spy = vi.fn();
    window.addEventListener(SESSIONS_SEEN_EVENT, spy);
    try {
      markSessionsSeen();
    } finally {
      window.removeEventListener(SESSIONS_SEEN_EVENT, spy);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(readSeenSessionsIso()).not.toBeNull();
  });
});
