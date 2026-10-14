import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAY } from "../../api/config.ts";
import handler, { type ApiRequest, type ApiResponse } from "../../api/play.ts";

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

/** Thenable postgrest-style chain resolving to result. */
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

function req(videoId: unknown, token = jwtFor("sess-1")): ApiRequest {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "1.2.3.4", "user-agent": "t" },
    body: { video_id: videoId },
  };
}

type Cfg = {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  sessionRow?: { session_id: string } | null;
  sessionError?: { message: string } | null;
  playRow?: Record<string, unknown> | null;
  rpcError?: { message: string } | null;
  sourceRow?: { src_url: string } | null;
};

function clients(c: Cfg = {}) {
  const userMock = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: c.user === undefined ? { id: "u1" } : c.user },
        error: c.userError ?? null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: c.playRow === undefined ? [{
      ok: true, code: "OK", flagged: false, minutes: 12,
      email: "s@e.c", phone_last4: "6789", views_left: 2, views_count: 1, consumed: true,
    }] : c.playRow === null ? null : [c.playRow], error: c.rpcError ?? null }),
  };
  const fromCalls: string[] = [];
  const adminMock = {
    auth: { admin: { signOut: vi.fn().mockResolvedValue({}) } },
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "active_sessions") {
        return chain({
          data: c.sessionRow === undefined ? { session_id: "sess-1" } : c.sessionRow,
          error: c.sessionError ?? null,
        });
      }
      if (table === "video_sources") {
        return chain({
          data: c.sourceRow === undefined
            ? { src_url: "https://drive.google.com/file/d/ABC123_xyz/view?usp=sharing" }
            : c.sourceRow,
          error: null,
        });
      }
      return chain({ data: null, error: null });
    }),
  };
  mockedCreate.mockImplementation(((...args: unknown[]) =>
    (args[1] === ENV.SUPABASE_SERVICE_ROLE_KEY ? adminMock : userMock)) as never);
  return { userMock, adminMock, fromCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
});

describe("config", () => {
  it("matches the spec thresholds", () => {
    expect(PLAY).toMatchObject({
      r1Max: 5, r1Secs: 30, r2Warn: 120, r2Deny: 240, r2Mins: 60, r3Max: 3, repeatSecs: 90,
    });
  });
});

describe("POST /api/play guards", () => {
  it("rejects non-POST", async () => {
    clients();
    const { res, seen } = resCapture();
    await handler({ method: "GET", headers: {}, body: {} }, res);
    expect(seen.code).toBe(405);
  });

  it("rejects missing/bad video_id", async () => {
    clients();
    for (const bad of [undefined, "", "not-a-uuid", 42]) {
      const { res, seen } = resCapture();
      await handler(req(bad), res);
      expect(seen.code).toBe(400);
    }
  });

  it("rejects missing and invalid tokens", async () => {
    clients();
    const { res: r1, seen: s1 } = resCapture();
    await handler({ method: "POST", headers: {}, body: { video_id: "11111111-1111-1111-1111-111111111111" } }, r1);
    expect(s1.code).toBe(401);

    clients({ user: null, userError: { message: "bad" } });
    const { res: r2, seen: s2 } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), r2);
    expect(s2.code).toBe(401);
    expect((s2.payload as { code: string }).code).toBe("INVALID_TOKEN");
  });

  it("denies a mismatched session and logs it", async () => {
    const { adminMock } = clients({ sessionRow: { session_id: "other-device" } });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111", jwtFor("sess-1")), res);
    expect(seen.code).toBe(401);
    expect((seen.payload as { code: string }).code).toBe("SESSION_MISMATCH");
    expect((seen.payload as { ar: string }).ar).toContain("جهاز آخر");
    expect(adminMock.from).toHaveBeenCalledWith("watch_events");
  });

  it("adopts legacy sessions with no active row", async () => {
    const { adminMock, userMock } = clients({ sessionRow: null });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(200);
    expect(userMock.rpc).toHaveBeenCalledWith("request_play", expect.objectContaining({ p_video: "11111111-1111-1111-1111-111111111111" }));
    expect(adminMock.from).toHaveBeenCalledWith("active_sessions");
  });

  it("maps banned / not-enrolled / cap to 403 with codes", async () => {
    for (const code of ["BANNED", "NOT_ENROLLED", "VIEW_CAP"]) {
      clients({ playRow: { ok: false, code, minutes: 0, email: "", phone_last4: "", views_left: 0, views_count: 3, consumed: false } });
      const { res, seen } = resCapture();
      await handler(req("11111111-1111-1111-1111-111111111111"), res);
      expect(seen.code).toBe(403);
      expect((seen.payload as { code: string }).code).toBe(code);
    }
  });

  it("denies R1 with 429", async () => {
    clients({ playRow: { ok: false, code: "RATE_LIMITED", minutes: 0, email: "", phone_last4: "", views_left: 0, views_count: 0, consumed: false } });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(429);
    expect((seen.payload as { code: string }).code).toBe("RATE_LIMITED");
  });

  it("passes R2/R3 flags through as success", async () => {
    clients({ playRow: { ok: true, code: "OK", flagged: true, minutes: 30, email: "s@e.c", phone_last4: "1", views_left: 1, views_count: 2, consumed: true } });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(200);
    expect((seen.payload as { ok: boolean }).ok).toBe(true);
  });

  it("denies R2 over-limit with 403", async () => {
    clients({ playRow: { ok: false, code: "SUSPICIOUS_DENY", minutes: 0, email: "", phone_last4: "", views_left: 0, views_count: 0, consumed: false } });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(403);
    expect((seen.payload as { code: string }).code).toBe("SUSPICIOUS_DENY");
  });

  it("repeat window succeeds without error", async () => {
    clients({ playRow: { ok: true, code: "OK", flagged: false, minutes: 12, email: "s@e.c", phone_last4: "5", views_left: 1, views_count: 2, consumed: false } });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(200);
    expect((seen.payload as { ok: boolean }).ok).toBe(true);
  });

  it("500s without env", async () => {
    clients();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(500);
  });
});

describe("POST /api/play success shape", () => {
  it("returns preview embed + minutes + watermark only (no secrets)", async () => {
    clients();
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(200);
    const p = seen.payload as Record<string, unknown>;
    expect(p.embedUrl).toBe("https://drive.google.com/file/d/ABC123_xyz/preview");
    expect(p.minutes).toBe(12);
    expect(p.watermark).toEqual({ email: "s@e.c", phoneLast4: "6789" });
    expect(p.viewsLeft).toBe(2);
    const text = JSON.stringify(p);
    expect(text).not.toContain("national_id");
    expect(text).not.toContain("0123456789");
    expect(text).not.toContain("view?usp=sharing");
    expect(text).not.toContain("src_url");
  });

  it("maps YouTube links to nocookie embeds", async () => {
    clients({ sourceRow: { src_url: "https://youtu.be/dQw4w9WgXcQ" } });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect((seen.payload as { embedUrl: string }).embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("404s when no source row exists", async () => {
    clients({ sourceRow: null });
    const { res, seen } = resCapture();
    await handler(req("11111111-1111-1111-1111-111111111111"), res);
    expect(seen.code).toBe(404);
    expect((seen.payload as { code: string }).code).toBe("VIDEO_MISSING");
  });
});
