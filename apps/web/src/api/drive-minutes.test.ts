import { beforeEach, describe, expect, it, vi } from "vitest";
import handler, { type ApiResponse } from "../../api/drive-minutes.ts";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@supabase/supabase-js";

const mockedCreate = vi.mocked(createClient);
const ENV = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  GOOGLE_API_KEY: "gkey",
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ sub: "a1", session_id: "s1" })}.sig`;

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

function req(fileId: unknown, role = "admin") {
  mockedCreate.mockImplementation(((...args: unknown[]) => {
    if (args[1] === ENV.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { role }, error: null }),
            }),
          }),
        }),
      };
    }
    return {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "a1" } }, error: null }) },
    };
  }) as never);
  return {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: { fileId },
  };
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = ENV.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
  process.env.GOOGLE_API_KEY = ENV.GOOGLE_API_KEY;
  process.env.LOG_LEVEL = "error";
  globalThis.fetch = realFetch;
});

describe("POST /api/drive-minutes", () => {
  it("rejects non-POST, missing auth, bad ids", async () => {
    req("abc123");
    const { res, seen } = resCapture();
    await handler({ method: "GET", headers: {}, body: {} }, res);
    expect(seen.code).toBe(405);

    const { res: r2, seen: s2 } = resCapture();
    await handler(req("bad id!!"), r2);
    expect(s2.code).toBe(400);
  });

  it("rejects non-admins", async () => {
    const { res, seen } = resCapture();
    await handler(req("abc123", "student"), res);
    expect(seen.code).toBe(403);
  });

  it("returns ceiled minutes from durationMillis", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ videoMediaMetadata: { durationMillis: "90000" }, mimeType: "video/mp4" }),
    }) as never;
    const { res, seen } = resCapture();
    await handler(req("abc123"), res);
    expect(seen.code).toBe(200);
    expect((seen.payload as { minutes: number }).minutes).toBe(2);
  });

  it("maps drive errors and missing metadata", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
    const { res, seen } = resCapture();
    await handler(req("abc123"), res);
    expect(seen.code).toBe(502);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mimeType: "video/mp4" }),
    }) as never;
    const { res: r2, seen: s2 } = resCapture();
    await handler(req("abc123"), r2);
    expect(s2.code).toBe(404);
  });

  it("500s without the google key", async () => {
    delete process.env.GOOGLE_API_KEY;
    const { res, seen } = resCapture();
    await handler(req("abc123"), res);
    expect(seen.code).toBe(500);
  });

  it("logs one JSON line with the incoming request id and final status", async () => {
    process.env.LOG_LEVEL = "info";
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { res } = resCapture();
      await handler({ method: "GET", headers: { "x-request-id": "req_test" }, body: {} }, res);
      const line = write.mock.calls.map((call) => String(call[0])).find((text) => text.includes("api.request.end"));
      expect(line).toBeDefined();
      const rec = JSON.parse(String(line)) as Record<string, unknown>;
      expect(rec.correlation_id).toBe("req_test");
      expect(rec.event).toBe("api.request.end");
      expect(rec.msg).toBe("request finished");
      expect((rec.ctx as Record<string, unknown>).status).toBe(405);
      for (const key of ["ts", "level", "service", "env", "version", "module"]) expect(rec[key]).toBeDefined();
    } finally {
      write.mockRestore();
    }
  });

  it("returns the request id in error payloads and sets the response header", async () => {
    const setHeader = vi.fn();
    const capture = resCapture();
    const res = Object.assign(capture.res, { setHeader });
    await handler({ method: "GET", headers: { "x-request-id": "req_error" }, body: {} }, res);
    expect(setHeader).toHaveBeenCalledWith("x-request-id", "req_error");
    expect((capture.seen.payload as Record<string, unknown>).correlation_id).toBe("req_error");
  });
});
