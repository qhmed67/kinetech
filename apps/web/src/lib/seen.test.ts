import { describe, expect, it, vi } from "vitest";
import { markSessionsSeen, mergeActivity, readSeenSessionsIso, SESSIONS_SEEN_EVENT } from "./seen";

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

describe("mergeActivity", () => {
  const sessions = [
    { id: "s1", title: "Lesson new", date: "2026-10-20T10:00:00Z" },
    { id: "s2", title: "Lesson old", date: "2026-10-18T10:00:00Z" },
  ];
  const notifs = [
    { id: "n1", title: "Notice mid", message: "m", is_read: false, created_at: "2026-10-19T10:00:00Z" },
    { id: "n2", title: "Notice read", message: "", is_read: true, created_at: "2026-10-17T10:00:00Z" },
  ];

  it("interleaves purely by date, newest first", () => {
    const feed = mergeActivity(sessions, notifs, 10, null);
    expect(feed.map((f) => f.id)).toEqual(["s-s1", "n-n1", "s-s2", "n-n2"]);
    expect(feed.map((f) => f.kind)).toEqual(["lesson", "notice", "lesson", "notice"]);
  });

  it("truncates to the preview limit", () => {
    expect(mergeActivity(sessions, notifs, 3, null)).toHaveLength(3);
    expect(mergeActivity(sessions, notifs, 0, null)).toEqual([]);
  });

  it("marks lessons unread past the seen marker, notices by is_read", () => {
    const feed = mergeActivity(sessions, notifs, 10, "2026-10-19T00:00:00Z");
    expect(feed.find((f) => f.id === "s-s1")?.unread).toBe(true);
    expect(feed.find((f) => f.id === "s-s2")?.unread).toBe(false);
    expect(feed.find((f) => f.id === "n-n1")?.unread).toBe(true);
    expect(feed.find((f) => f.id === "n-n2")?.unread).toBe(false);
  });

  it("returns [] for empty inputs", () => {
    expect(mergeActivity([], [], 3, null)).toEqual([]);
  });
});
