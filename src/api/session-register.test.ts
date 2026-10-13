import { beforeEach, describe, expect, it, vi } from "vitest";
import handler, { type ApiResponse } from "../../api/session-register.ts";

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
const jwtFor = (sessionId: string | null) =>
  `${b64({ alg: "HS256" })}.${b64(sessionId === null ? { sub: "u1" } : { sub: "u1", session_id: sessionId })}.sig`;

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

function req(token: string | null) {
  return {
    method: "POST",
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
    body: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
});

describe("POST /api/session-register", () => {
  it("rejects non-POST and missing tokens", async () => {
    const upsert = vi.fn();
    mockedCreate.mockReturnValue({ from: () => ({ upsert }) } as never);
    const { res, seen } = resCapture();
    await handler({ method: "GET", headers: {}, body: {} }, res);
    expect(seen.code).toBe(405);

    const { res: r2, seen: s2 } = resCapture();
    await handler(req(null), r2);
    expect(s2.code).toBe(401);
  });

  it("registers the session and signs out other devices", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const signOut = vi.fn().mockResolvedValue({});
    mockedCreate.mockImplementation(((...args: unknown[]) => {
      if (args[1] === ENV.SUPABASE_SERVICE_ROLE_KEY) {
        return { from: () => ({ upsert }), auth: { admin: { signOut } } };
      }
      return {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
      };
    }) as never);
    const token = jwtFor("sess-9");
    const { res, seen } = resCapture();
    await handler(req(token), res);
    expect(seen.code).toBe(200);
    expect((seen.payload as { ok: boolean }).ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", session_id: "sess-9", user_agent: "" },
      { onConflict: "user_id" },
    );
    expect(signOut).toHaveBeenCalledWith(token, "others");
  });

  it("401s on invalid tokens and 500s without a session claim", async () => {
    mockedCreate.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "bad" } }) },
    } as never);
    const { res, seen } = resCapture();
    await handler(req(jwtFor("sess-1")), res);
    expect(seen.code).toBe(401);

    mockedCreate.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
    } as never);
    const { res: r2, seen: s2 } = resCapture();
    await handler(req(jwtFor(null)), r2);
    expect(s2.code).toBe(500);
  });
});
