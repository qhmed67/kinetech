// Concurrent session / device limit — the pure rules (Task 3).
//
// The rules are deliberately fail-open: nothing here may ever answer "no"
// because of a missing row, a malformed value or an unreachable database.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_LIMITS,
  evaluateSessionLimits,
  isLiveSession,
  normalizeSessionLimits,
  type SessionObservation,
} from "./sessionGuard";

function obs(overrides: Partial<SessionObservation> = {}): SessionObservation {
  return {
    sessionKey: "s1",
    deviceId: null,
    lastSeen: new Date().toISOString(),
    ip: "1.2.3.4",
    ...overrides,
  };
}

describe("normalizeSessionLimits", () => {
  it("falls back to the log-only defaults for a missing value", () => {
    expect(normalizeSessionLimits(undefined)).toEqual(DEFAULT_SESSION_LIMITS);
    expect(normalizeSessionLimits(null)).toEqual(DEFAULT_SESSION_LIMITS);
    expect(normalizeSessionLimits("nope")).toEqual(DEFAULT_SESSION_LIMITS);
    expect(normalizeSessionLimits([1, 2])).toEqual(DEFAULT_SESSION_LIMITS);
  });

  it("ships LOG-ONLY: an unknown mode never enforces", () => {
    expect(normalizeSessionLimits({ mode: "whatever" }).mode).toBe("log");
    expect(normalizeSessionLimits({ mode: "enforce" }).mode).toBe("enforce");
  });

  it("keeps IP binding off unless it is explicitly true", () => {
    expect(normalizeSessionLimits({ ip_binding: false }).ipBinding).toBe(false);
    expect(normalizeSessionLimits({ ip_binding: "yes" }).ipBinding).toBe(false);
    expect(normalizeSessionLimits({ ip_binding: true }).ipBinding).toBe(true);
  });

  it("ignores one broken field without discarding the rest", () => {
    const limits = normalizeSessionLimits({
      mode: "enforce",
      max_concurrent_sessions: "abc",
      max_concurrent_devices: 5,
      heartbeat_ttl_minutes: -1,
    });
    expect(limits.mode).toBe("enforce");
    expect(limits.maxConcurrentSessions).toBe(DEFAULT_SESSION_LIMITS.maxConcurrentSessions);
    expect(limits.maxConcurrentDevices).toBe(5);
    expect(limits.heartbeatTtlMinutes).toBeGreaterThanOrEqual(5);
  });

  it("clamps the heartbeat window to at least 5 minutes", () => {
    expect(normalizeSessionLimits({ heartbeat_ttl_minutes: 1 }).heartbeatTtlMinutes).toBe(5);
    expect(normalizeSessionLimits({ heartbeat_ttl_minutes: 99999 }).heartbeatTtlMinutes).toBe(24 * 60);
  });
});

describe("isLiveSession", () => {
  it("treats a stale heartbeat as dead", () => {
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    expect(isLiveSession({ lastSeen: old }, 30)).toBe(false);
    expect(isLiveSession({ lastSeen: new Date().toISOString() }, 30)).toBe(true);
    expect(isLiveSession({ lastSeen: "not-a-date" }, 30)).toBe(false);
  });
});

describe("evaluateSessionLimits", () => {
  const now = Date.now();

  it("allows everything under the limits", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce" },
      [obs({ sessionKey: "a" }), obs({ sessionKey: "b" })],
      { sessionKey: "b" },
      now,
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.wouldBlock).toBe(false);
    expect(verdict.liveSessions).toBe(2);
  });

  it("LOG-ONLY records the violation but still allows the request", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "log", maxConcurrentSessions: 1 },
      [obs({ sessionKey: "a" }), obs({ sessionKey: "b" }), obs({ sessionKey: "c" })],
      { sessionKey: "c" },
      now,
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.wouldBlock).toBe(true);
    expect(verdict.reason).toBe("sessions");
    expect(verdict.liveSessions).toBe(3);
  });

  it("ENFORCE refuses an account over the session limit", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce", maxConcurrentSessions: 1 },
      [obs({ sessionKey: "a" }), obs({ sessionKey: "b" })],
      { sessionKey: "b" },
      now,
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("sessions");
  });

  it("counts devices separately from sessions", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce", maxConcurrentDevices: 1 },
      [
        obs({ sessionKey: "a", deviceId: "dev-1" }),
        obs({ sessionKey: "b", deviceId: "dev-2" }),
      ],
      { sessionKey: "b", deviceId: "dev-2" },
      now,
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("devices");
    expect(verdict.liveDevices).toBe(2);
  });

  it("ignores dead sessions (stale heartbeat)", () => {
    const stale = new Date(now - 60 * 60_000).toISOString();
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce", heartbeatTtlMinutes: 30 },
      [obs({ sessionKey: "a" }), obs({ sessionKey: "old", lastSeen: stale })],
      { sessionKey: "a" },
      now,
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.liveSessions).toBe(1);
  });

  it("does not look at the IP while binding is off", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce", ipBinding: false },
      [obs({ sessionKey: "a", ip: "9.9.9.9" })],
      { sessionKey: "a", ip: "1.1.1.1" },
      now,
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBeNull();
  });

  it("flags the same session key from another IP when binding is on", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce", ipBinding: true },
      [obs({ sessionKey: "a", ip: "9.9.9.9" })],
      { sessionKey: "a", ip: "1.1.1.1" },
      now,
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe("ip");
  });

  it("never blocks when there is nothing to judge", () => {
    const verdict = evaluateSessionLimits(
      { ...DEFAULT_SESSION_LIMITS, mode: "enforce" },
      [],
      { sessionKey: "a" },
      now,
    );
    expect(verdict.allowed).toBe(true);
  });
});
