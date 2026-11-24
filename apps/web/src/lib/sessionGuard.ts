/* Session / device concurrency guard — SHARED RULES (Task 3).
 *
 * The rules live here in one pure module so the web client, the API copies
 * and the tests can never disagree about what "over the limit" means.
 *
 * The API files (apps/web/api/play.ts, apps/web/api/playback/start.ts) are
 * SELF-CONTAINED (Vercel's bundler rejects relative imports there), so they
 * carry inline copies of these functions. The copies are asserted against
 * this module by apps/web/src/api/session-guard-copies.test.ts — if they
 * ever drift, that test fails.
 *
 * Design constraints that shaped this module:
 *
 * - FAIL-OPEN. Every function here answers "may this continue?" and the
 *   safe answer when the settings or the database are unreachable is YES.
 *   A missing setting, an unparseable value or a read error must never lock
 *   a paying student out of their own lesson.
 *
 * - LOG-ONLY FIRST. The shipped default mode is "log": an over-limit
 *   request is LOGGED and recorded, but still allowed. The admin switches
 *   the mode to "enforce" once the numbers look sane. That is what makes
 *   the "concurrent sessions" rule safe to ship at all.
 *
 * - HEARTBEAT, NOT HISTORY. A session counts as live only while it keeps
 *   sending heartbeats. A crashed app, a closed tab or a shared family
 *   phone stops counting after the TTL window instead of locking the
 *   account out forever.
 *
 * - IP BINDING IS OFF BY DEFAULT. Mobile networks rotate the public IP
 *   mid-lesson; binding by IP would produce false positives for honest
 *   students. It stays configurable, but it is never on out of the box.
 */

/** The two operating modes of the guard. */
export type SessionLimitMode = "log" | "enforce";

/** The shape stored under the `session_limits` app_settings key. */
export type SessionLimits = {
  mode: SessionLimitMode;
  /** Live sessions allowed at the same time. */
  maxConcurrentSessions: number;
  /** Live devices allowed at the same time. */
  maxConcurrentDevices: number;
  /** Minutes without a heartbeat after which a session is considered dead. */
  heartbeatTtlMinutes: number;
  /** When true, the same session_key from a different IP is a violation. */
  ipBinding: boolean;
};

/**
 * The shipped defaults. `mode: "log"` is the important one: the guard
 * observes first and only blocks once the admin explicitly asks it to.
 */
export const DEFAULT_SESSION_LIMITS: SessionLimits = {
  mode: "log",
  maxConcurrentSessions: 2,
  maxConcurrentDevices: 3,
  heartbeatTtlMinutes: 30,
  ipBinding: false,
};

/** One live session as the guard sees it. */
export type SessionObservation = {
  /** Opaque session id (auth session id or device id). */
  sessionKey: string;
  /** Device id, when known (native app). */
  deviceId?: string | null;
  /** Last heartbeat, ISO timestamp. */
  lastSeen: string;
  /** Last seen IP, when known. */
  ip?: string | null;
};

/** What the guard decided, and why. */
export type SessionVerdict = {
  /** May the request continue? Fail-open means this is true by default. */
  allowed: boolean;
  /** Number of live sessions (heartbeat within the TTL window). */
  liveSessions: number;
  /** Number of live devices (heartbeat within the TTL window). */
  liveDevices: number;
  /** Which rule was hit, if any. */
  reason: "sessions" | "devices" | "ip" | null;
  /** True when the verdict only records an observation (log-only mode). */
  wouldBlock: boolean;
};

function toPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i >= 1 ? i : fallback;
}

/**
 * Normalise the raw `session_limits` JSON into usable limits.
 * Anything missing, malformed or out of range falls back to the default for
 * that field only — one bad field never discards the whole object.
 */
export function normalizeSessionLimits(value: unknown): SessionLimits {
  const fallback = DEFAULT_SESSION_LIMITS;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const mode: SessionLimitMode = raw.mode === "enforce" ? "enforce" : "log";
  const ttl = toPositiveInt(raw.heartbeat_ttl_minutes, fallback.heartbeatTtlMinutes);
  return {
    mode,
    maxConcurrentSessions: toPositiveInt(raw.max_concurrent_sessions, fallback.maxConcurrentSessions),
    maxConcurrentDevices: toPositiveInt(raw.max_concurrent_devices, fallback.maxConcurrentDevices),
    // A TTL below 5 minutes would expire a live session during a slow page
    // load; clamp rather than trust the setting.
    heartbeatTtlMinutes: Math.max(5, Math.min(ttl, 24 * 60)),
    ipBinding: raw.ip_binding === true,
  };
}

/** True when a heartbeat is recent enough for the session to count as live. */
export function isLiveSession(
  observation: Pick<SessionObservation, "lastSeen">,
  ttlMinutes: number,
  nowMs: number = Date.now(),
): boolean {
  const seen = Date.parse(observation.lastSeen ?? "");
  if (!Number.isFinite(seen)) return false;
  return nowMs - seen < ttlMinutes * 60_000;
}

/**
 * Apply the rules to the set of known sessions.
 *
 * `current` describes the session making the request: its key, device and
 * IP. The caller passes every session row it read for this user; this
 * function decides which are live and whether the current one is over the
 * limit.
 */
export function evaluateSessionLimits(
  limits: SessionLimits,
  observations: SessionObservation[],
  current: { sessionKey: string; deviceId?: string | null; ip?: string | null },
  nowMs: number = Date.now(),
): SessionVerdict {
  const live = observations.filter((o) => isLiveSession(o, limits.heartbeatTtlMinutes, nowMs));

  // Distinct session keys and distinct devices among the live rows.
  const sessionKeys = new Set<string>();
  const deviceIds = new Set<string>();
  for (const row of live) {
    if (row.sessionKey) sessionKeys.add(row.sessionKey);
    const device = row.deviceId ?? "";
    if (device) deviceIds.add(device);
  }
  const liveSessions = sessionKeys.size;
  const liveDevices = deviceIds.size;

  const base: SessionVerdict = {
    allowed: true,
    liveSessions,
    liveDevices,
    reason: null,
    wouldBlock: false,
  };

  // IP binding (optional, off by default): the SAME session key seen from a
  // different IP is a violation. Only the current session's own row matters.
  if (limits.ipBinding && current.ip) {
    const own = live.find((o) => o.sessionKey === current.sessionKey);
    if (own && own.ip && own.ip !== current.ip) {
      return { ...base, reason: "ip", allowed: limits.mode !== "enforce", wouldBlock: true };
    }
  }

  if (liveSessions > limits.maxConcurrentSessions) {
    return { ...base, reason: "sessions", allowed: limits.mode !== "enforce", wouldBlock: true };
  }
  if (liveDevices > limits.maxConcurrentDevices) {
    return { ...base, reason: "devices", allowed: limits.mode !== "enforce", wouldBlock: true };
  }
  return base;
}

/** Where the API files inline-copy the rules above (drift guard). */
export const SESSION_GUARD_COPY_MARKER = "session-guard-v1";
