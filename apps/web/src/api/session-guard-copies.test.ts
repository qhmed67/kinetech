// Drift guard: the API copy of the session-limit rules must behave exactly
// like the shared module (Task 3).
//
// apps/web/api/play.ts is SELF-CONTAINED (Vercel's function bundler rejects
// cross-file imports there), so it carries an inline copy of the rules in
// apps/web/src/lib/sessionGuard.ts. This test fails if the two ever diverge.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_LIMITS,
  evaluateSessionLimits as sharedEvaluate,
  normalizeSessionLimits as sharedNormalize,
  type SessionLimits,
  type SessionObservation,
} from "../lib/sessionGuard";
import {
  evaluateSessionLimits as apiEvaluate,
  normalizeSessionLimits as apiNormalize,
} from "../../api/play.ts";

const RAW_VALUES: unknown[] = [
  undefined,
  null,
  "nope",
  [1, 2],
  { mode: "enforce", max_concurrent_sessions: 4, max_concurrent_devices: 6, heartbeat_ttl_minutes: 45, ip_binding: true },
  { mode: "log", max_concurrent_sessions: 1, max_concurrent_devices: 1, heartbeat_ttl_minutes: 5, ip_binding: false },
  { mode: "banana", max_concurrent_sessions: "x", max_concurrent_devices: 0, heartbeat_ttl_minutes: 1 },
  { ip_binding: "yes" },
];

const NOW = Date.parse("2026-11-24T00:00:00.000Z");

function sessionRows(nowMs: number): SessionObservation[] {
  return [
    { sessionKey: "a", deviceId: "dev-1", lastSeen: new Date(nowMs - 60_000).toISOString(), ip: "1.1.1.1" },
    { sessionKey: "b", deviceId: "dev-2", lastSeen: new Date(nowMs - 120_000).toISOString(), ip: "2.2.2.2" },
    { sessionKey: "c", deviceId: null, lastSeen: new Date(nowMs - 60 * 60_000).toISOString(), ip: "3.3.3.3" },
  ];
}

describe("session guard copies", () => {
  it("normalizes the same values in both places", () => {
    for (const raw of RAW_VALUES) {
      expect(apiNormalize(raw)).toEqual(sharedNormalize(raw));
    }
  });

  it("never silently enforces: the shared default stays log-only", () => {
    expect(sharedNormalize(undefined).mode).toBe("log");
    expect(apiNormalize(undefined).mode).toBe("log");
    expect(DEFAULT_SESSION_LIMITS.mode).toBe("log");
  });

  it("reaches the same verdict in both places", () => {
    const modes: SessionLimits["mode"][] = ["log", "enforce"];
    for (const mode of modes) {
      for (const maxSessions of [1, 2, 5]) {
        for (const maxDevices of [1, 3]) {
          for (const ipBinding of [false, true]) {
            const limits: SessionLimits = {
              mode,
              maxConcurrentSessions: maxSessions,
              maxConcurrentDevices: maxDevices,
              heartbeatTtlMinutes: 30,
              ipBinding,
            };
            const current = { sessionKey: "b", deviceId: "dev-2", ip: "9.9.9.9" };
            const rows = sessionRows(NOW);
            expect(apiEvaluate(limits, rows, current, NOW)).toEqual(
              sharedEvaluate(limits, rows, current, NOW),
            );
          }
        }
      }
    }
  });
});
