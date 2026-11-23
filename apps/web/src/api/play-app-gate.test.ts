// Native app version gate — server-side 426 enforcement (Task 2).
//
// The rules under test (all fail-open by design):
//   - a native client below the minimum gets 426 / APP_001,
//   - a browser (no x-app-platform) is NEVER affected,
//   - a native client without a version header is NEVER affected,
//   - force_update = false never blocks,
//   - a missing/unreadable gate row never blocks.

import { beforeEach, describe, expect, it, vi } from "vitest";
import handler, {
  _resetNativeGateCacheForTests,
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

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "maybeSingle", "upsert", "insert", "delete", "lt", "rpc"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  (c as { then: unknown }).then = (
    Promise.resolve(result) as Promise<unknown> as { then: unknown }
  ).then.bind(Promise.resolve(result));
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

type GateRow = { gate_enabled: boolean; min_supported_version: string; force_update: boolean } | null;

/** Minimal client mock: only app_settings + the tables /api/play touches. */
function clients(gateRow: GateRow) {
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
        return chain({ data: gateRow ? { value: gateRow } : null, error: null });
      }
      if (table === "active_sessions") {
        return chain({ data: { session_id: "sess-1" }, error: null });
      }
      if (table === "profiles") {
        return chain({ data: { banned: false, email: "s@e.c", phone: "0123456789", role: "student" }, error: null });
      }
      if (table === "enrollments") {
        return chain({ data: { user_id: "u1" }, error: null });
      }
      if (table === "videos") {
        return chain({
          data: { course_id: "c1", mins: 10, drive_file_id: "ABC123_xyz", youtube_video_id: "dQw4w9WgXcQ" },
          error: null,
        });
      }
      if (table === "video_sources") {
        return chain({ data: { src_url: "https://drive.google.com/file/d/ABC123_xyz/view?usp=sharing" }, error: null });
      }
      return chain({ data: null, error: null });
    }),
  };
  mockedCreate.mockImplementation(((...args: unknown[]) =>
    (args[1] === ENV.SUPABASE_SERVICE_ROLE_KEY ? adminMock : userMock)) as never);
  return { userMock, adminMock };
}

function req(headers: Record<string, string> = {}): ApiRequest {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwtFor("sess-1")}`,
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "t",
      ...headers,
    },
    body: { video_id: "11111111-1111-1111-1111-111111111111" },
  };
}

const GATE: GateRow = {
  gate_enabled: true,
  min_supported_version: "2.0.0",
  force_update: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetNativeGateCacheForTests();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
});

describe("native app version gate", () => {
  it("answers 426 / APP_001 for an outdated native client", async () => {
    const { userMock } = clients(GATE);
    const { res, seen } = resCapture();
    await handler(req({ "x-app-version": "1.0.0", "x-app-platform": "android" }), res);
    expect(seen.code).toBe(426);
    expect((seen.payload as { code: string }).code).toBe("APP_001");
    // No view may be burned by a blocked request.
    expect(userMock.rpc).not.toHaveBeenCalled();
  });

  it("allows a native client at or above the minimum", async () => {
    clients(GATE);
    const { res, seen } = resCapture();
    await handler(req({ "x-app-version": "2.0.0", "x-app-platform": "android" }), res);
    expect(seen.code).toBe(200);

    _resetNativeGateCacheForTests();
    const second = resCapture();
    await handler(req({ "x-app-version": "2.1.0", "x-app-platform": "ios" }), second.res);
    expect(second.seen.code).toBe(200);
  });

  it("never blocks a browser (no x-app-platform)", async () => {
    clients(GATE);
    const { res, seen } = resCapture();
    await handler(req({ "x-app-version": "1.0.0" }), res);
    expect(seen.code).toBe(200);
  });

  it("never blocks a native client that reports no version", async () => {
    clients(GATE);
    const { res, seen } = resCapture();
    await handler(req({ "x-app-platform": "android" }), res);
    expect(seen.code).toBe(200);
  });

  it("never blocks when force_update is off", async () => {
    clients({ ...GATE!, force_update: false });
    const { res, seen } = resCapture();
    await handler(req({ "x-app-version": "1.0.0", "x-app-platform": "android" }), res);
    expect(seen.code).toBe(200);
  });

  it("never blocks when the gate is disabled (kill switch)", async () => {
    clients({ ...GATE!, gate_enabled: false });
    const { res, seen } = resCapture();
    await handler(req({ "x-app-version": "1.0.0", "x-app-platform": "android" }), res);
    expect(seen.code).toBe(200);
  });

  it("never blocks when the gate row is missing (fail-open)", async () => {
    clients(null);
    const { res, seen } = resCapture();
    await handler(req({ "x-app-version": "1.0.0", "x-app-platform": "android" }), res);
    expect(seen.code).toBe(200);
  });
});
