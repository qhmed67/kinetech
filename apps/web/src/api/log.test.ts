import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import handler, { type ApiResponse } from "../../api/log.ts";
import { createClient } from "@supabase/supabase-js";

const mockedCreate = vi.mocked(createClient);

function resCapture() {
  const seen: { code?: number; payload?: Record<string, unknown> } = {};
  const res = {
    status(code: number) {
      seen.code = code;
      return res;
    },
    json(payload: unknown) {
      seen.payload = payload as Record<string, unknown>;
      return payload;
    },
  };
  return { res: res as unknown as ApiResponse, seen };
}

const LINE = {
  ts: "2026-11-20T20:00:00.000Z",
  level: "error",
  service: "kinetech-web",
  env: "dev",
  version: "dev",
  module: "ui.http",
  event: "ui.request.end",
  msg: "GET /api/play failed",
  correlation_id: "req_log_ok",
  duration_ms: 12,
  ctx: { route: "/api/play", password: "secret", token: "abc" },
  error: { code: "SYS_001", type: "Error", message: "https://secret.example/x" },
};

function req(body: unknown, ip = "203.0.113.1") {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "x-request-id": "req_handler" },
    body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.LOG_LEVEL = "error";
});

describe("POST /api/log", () => {
  it("rejects bad methods and payloads", async () => {
    const r1 = resCapture();
    await handler({ method: "GET", headers: {}, body: {} }, r1.res);
    expect(r1.seen.code).toBe(405);

    for (const body of [
      {},
      { logs: [] },
      { logs: Array.from({ length: 21 }, () => LINE) },
      { logs: [{ ...LINE, level: "info" }] },
      { logs: [{ ...LINE, service: "evil" }] },
      { logs: [{ ...LINE, ts: "not-a-date" }] },
    ]) {
      const r = resCapture();
      await handler(req(body, "203.0.113.2"), r.res);
      expect(r.seen.code).toBe(400);
    }
  });

  it("stores an allow-listed, redacted batch", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockedCreate.mockReturnValue({ from: () => ({ insert }) } as never);

    const r = resCapture();
    await handler(req({ logs: [LINE] }, "203.0.113.3"), r.res);

    expect(r.seen.code).toBe(200);
    expect(r.seen.payload).toMatchObject({ ok: true, accepted: 1 });
    expect((r.seen.payload as Record<string, unknown>).correlation_id).toBe("req_handler");

    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "ui.request.end", correlation_id: "req_log_ok", duration_ms: 12 });
    expect(rows[0].ctx).toEqual({ route: "/api/play" });
    expect(JSON.stringify(rows[0])).not.toContain("secret");
    expect(JSON.stringify(rows[0])).not.toContain("https://");
  });

  it("rate limits per IP and logs a registered code", async () => {
    process.env.LOG_LEVEL = "warn";
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const insert = vi.fn().mockResolvedValue({ error: null });
      mockedCreate.mockReturnValue({ from: () => ({ insert }) } as never);
      const payload = { logs: [LINE] };
      let last = resCapture();
      for (let i = 0; i < 13; i += 1) {
        last = resCapture();
        await handler(req(payload, "203.0.113.4"), last.res);
      }
      expect(last.seen.code).toBe(429);
      expect(last.seen.payload).toMatchObject({ code: "RATE_LIMITED" });
      const lines = write.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes('"code":"LOG_001"'))).toBe(true);
    } finally {
      write.mockRestore();
    }
  });

  it("returns DB_ERROR and logs DB_001 when the insert fails", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const insert = vi.fn().mockResolvedValue({ error: { name: "PostgrestError", message: "relation missing" } });
      mockedCreate.mockReturnValue({ from: () => ({ insert }) } as never);

      const r = resCapture();
      await handler(req({ logs: [LINE] }, "203.0.113.5"), r.res);
      expect(r.seen.code).toBe(500);
      expect(r.seen.payload).toMatchObject({ code: "DB_ERROR" });
      const lines = write.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes('"code":"DB_001"'))).toBe(true);
    } finally {
      write.mockRestore();
    }
  });
});
