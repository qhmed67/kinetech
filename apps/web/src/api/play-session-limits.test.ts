// Task 3 server rules: concurrent session/device limit, Direct Drive tier
// toggle and the configurable stream-token lifetime.
//
// Every rule here is FAIL-OPEN by design:
//   - the limit ships in LOG-ONLY mode (over-limit accounts are allowed),
//   - a missing play_sessions table or a DB error never blocks a student,
//   - a missing settings row keeps the previous behaviour,
//   - the stream-token lifetime is clamped into 300..7200 seconds.

import { beforeEach, describe, expect, it, vi } from "vitest";
import handler, {
  _resetSettingsCacheForTests,
  type ApiRequest,
  type ApiResponse,
} from "../../api/play.ts";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";

const mockedCreate = vi.mocked(createClient);
const ENV = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwtFor = (sessionId: string) =>
  `${b64({ alg: "HS256" })}.${b64({ sub: "u1", session_id: sessionId })}.sig`;

/** Thenable chain: the result is resolved at await time, not at build time. */
function chain(get: (calls: string[]) => { data: unknown; error: unknown }) {
  const calls: string[] = [];
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle", "upsert", "insert", "delete", "lt", "gte", "rpc", "order"]) {
    c[m] = vi.fn(() => {
      calls.push(m);
      return c;
    });
  }
  (c as { then: unknown }).then = (
    (onFulfilled?: unknown, onRejected?: unknown) =>
      Promise.resolve()
        .then(() => get(calls))
        .then(onFulfilled as never, onRejected as never)
  );
  return c;
}

function resCapture() {
  const seen: { code?: number; payload?: Record<string, unknown> } = {};
  const res = {
    status: vi.fn((code: number) => {
      seen.code = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      seen.payload = payload as Record<string, unknown>;
      return payload;
    }),
  };
  return { res: res as unknown as ApiResponse, seen };
}

type SessionRow = {
  session_key: string;
  device_id: string | null;
  last_seen: string;
  ip: string | null;
};

type Opts = {
  settings?: Record<string, unknown>;
  sessions?: SessionRow[];
  playSessionsError?: boolean;
};

function clients(opts: Opts = {}) {
  const settings = opts.settings ?? {};
  const sessions = opts.sessions ?? [];
  const userMock = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: [
        {
          ok: true, code: "OK", flagged: false, minutes: 12,
          email: "s@e.c", phone_last4: "6789", views_left: 2, views_count: 1, consumed: true,
        },
      ],
      error: null,
    }),
  };
  const adminMock = {
    auth: { admin: { signOut: vi.fn().mockResolvedValue({}) } },
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        // Key-aware: each .eq("key", …) selects one row.
        let key = "";
        const c: Record<string, unknown> = {};
        c.select = vi.fn(() => c);
        c.eq = vi.fn((_column: string, value: string) => {
          key = value;
          return c;
        });
        c.maybeSingle = vi.fn(() => c);
        (c as { then: unknown }).then = (
          (onFulfilled?: unknown, onRejected?: unknown) =>
            Promise.resolve()
              .then(() => ({ data: key in settings ? { value: settings[key] } : null, error: null }))
              .then(onFulfilled as never, onRejected as never)
        );
        return c;
      }
      if (table === "play_sessions") {
        return chain((calls) => {
          if (calls.includes("upsert")) {
            return { data: null, error: opts.playSessionsError ? { message: "missing table" } : null };
          }
          return { data: sessions, error: null };
        });
      }
      if (table === "active_sessions") {
        return chain(() => ({ data: { session_id: "sess-1" }, error: null }));
      }
      if (table === "profiles") {
        return chain(() => ({ data: { banned: false, email: "s@e.c", phone: "0123456789", role: "student" }, error: null }));
      }
      if (table === "enrollments") {
        return chain(() => ({ data: { user_id: "u1" }, error: null }));
      }
      if (table === "videos") {
        return chain(() => ({
          data: { course_id: "c1", mins: 10, drive_file_id: "ABC123_xyz", youtube_video_id: "dQw4w9WgXcQ" },
          error: null,
        }));
      }
      if (table === "video_sources") {
        return chain(() => ({
          data: { src_url: "https://drive.google.com/file/d/ABC123_xyz/view?usp=sharing" },
          error: null,
        }));
      }
      return chain(() => ({ data: null, error: null }));
    }),
  };
  mockedCreate.mockImplementation(((...args: unknown[]) =>
    (args[1] === ENV.SUPABASE_SERVICE_ROLE_KEY ? adminMock : userMock)) as never);
  return { userMock, adminMock };
}

function req(body: Record<string, unknown> = {}): ApiRequest {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwtFor("sess-1")}`,
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "t",
    },
    body: { video_id: "11111111-1111-1111-1111-111111111111", ...body },
  };
}

function liveSessions(count: number, ttlMinutes = 30): SessionRow[] {
  const rows: SessionRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      session_key: `sess-${i}`,
      device_id: `dev-${i}`,
      last_seen: new Date(Date.now() - 60_000).toISOString(),
      ip: "1.2.3.4",
    });
  }
  void ttlMinutes;
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetSettingsCacheForTests();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VIDEO_STREAM_WORKER_URL;
  delete process.env.STREAM_TOKEN_SECRET;
  delete process.env.DRIVE_BROWSER_KEY;
});

describe("concurrent session limit (Task 3)", () => {
  it("allows an over-limit account while the mode is LOG-ONLY", async () => {
    clients({
      settings: {
        session_limits: {
          mode: "log",
          max_concurrent_sessions: 1,
          max_concurrent_devices: 1,
          heartbeat_ttl_minutes: 30,
          ip_binding: false,
        },
      },
      sessions: liveSessions(3),
    });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(200);
  });

  it("refuses an over-limit account when the mode is ENFORCE", async () => {
    clients({
      settings: {
        session_limits: {
          mode: "enforce",
          max_concurrent_sessions: 1,
          max_concurrent_devices: 5,
          heartbeat_ttl_minutes: 30,
          ip_binding: false,
        },
      },
      sessions: liveSessions(3),
    });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(403);
    expect((seen.payload as { code: string }).code).toBe("TOO_MANY_SESSIONS");
  });

  it("refuses when too many devices are live", async () => {
    clients({
      settings: {
        session_limits: {
          mode: "enforce",
          max_concurrent_sessions: 10,
          max_concurrent_devices: 1,
          heartbeat_ttl_minutes: 30,
          ip_binding: false,
        },
      },
      sessions: liveSessions(3),
    });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(403);
    expect((seen.payload as { code: string }).code).toBe("TOO_MANY_DEVICES");
  });

  it("never blocks when the play_sessions table is missing (fail-open)", async () => {
    const { userMock } = clients({
      settings: {
        session_limits: {
          mode: "enforce",
          max_concurrent_sessions: 1,
          max_concurrent_devices: 1,
          heartbeat_ttl_minutes: 30,
          ip_binding: false,
        },
      },
      playSessionsError: true,
      sessions: liveSessions(5),
    });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(200);
    expect(userMock.rpc).toHaveBeenCalled();
  });

  it("never blocks when the settings row is missing (fail-open)", async () => {
    clients({ settings: {}, sessions: liveSessions(9) });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(200);
  });
});

describe("Direct Drive tier toggle (Task 3)", () => {
  it("answers SYS_003 for the direct fallback when the tier is off", async () => {
    clients({ settings: { direct_drive_enabled: { enabled: false } } });
    const { res, seen } = resCapture();
    await handler(req({ fallback: "direct" }), res);
    expect(seen.code).toBe(503);
    expect((seen.payload as { code: string }).code).toBe("SYS_003");
  });

  it("tells the client that the Direct tier is unavailable", async () => {
    clients({ settings: { direct_drive_enabled: { enabled: false } } });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(200);
    expect((seen.payload as { directAvailable?: boolean }).directAvailable).toBe(false);
  });

  it("keeps the Direct tier available by default", async () => {
    clients({ settings: {} });
    process.env.DRIVE_BROWSER_KEY = "browser-key";
    const { res, seen } = resCapture();
    await handler(req({ fallback: "direct" }), res);
    expect(seen.code).toBe(200);
    expect((seen.payload as { mode: string }).mode).toBe("direct");
  });
});

describe("stream token lifetime (Task 3)", () => {
  beforeEach(() => {
    process.env.VIDEO_STREAM_WORKER_URL = "https://worker.example";
    process.env.STREAM_TOKEN_SECRET = "secret";
  });

  it("clamps a too-short lifetime to the minimum", async () => {
    clients({ settings: { stream_token_ttl_seconds: { seconds: 30 } } });
    const { res, seen } = resCapture();
    await handler(req(), res);
    expect(seen.code).toBe(200);
    const payload = seen.payload as { mode: string; expiresAt: string; ttlSeconds: number };
    expect(payload.mode).toBe("worker");
    expect(payload.ttlSeconds).toBe(300);
    const inSeconds = (Date.parse(payload.expiresAt) - Date.now()) / 1000;
    expect(inSeconds).toBeGreaterThan(250);
    expect(inSeconds).toBeLessThanOrEqual(300);
  });

  it("clamps a too-long lifetime to the maximum", async () => {
    clients({ settings: { stream_token_ttl_seconds: { seconds: 99_999 } } });
    const { res, seen } = resCapture();
    await handler(req(), res);
    const payload = seen.payload as { ttlSeconds: number };
    expect(payload.ttlSeconds).toBe(7200);
  });

  it("keeps the previous default when the row is missing", async () => {
    clients({ settings: {} });
    const { res, seen } = resCapture();
    await handler(req(), res);
    const payload = seen.payload as { ttlSeconds: number };
    expect(payload.ttlSeconds).toBe(3600);
  });
});
