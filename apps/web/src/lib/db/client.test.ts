import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const chain = (data: unknown, error?: unknown) => {
    const c: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) c[method] = () => c;
    c.then = (onFulfilled?: unknown, onRejected?: unknown) =>
      Promise.resolve({ data, error: error ?? null }).then(onFulfilled, onRejected);
    return c;
  };
  return {
    from: vi.fn((_table: string) => chain([{ id: "v1" }])),
    rpc: vi.fn((_name: string) =>
      Promise.resolve({
        data: null,
        error: { name: "PostgrestError", code: "42883", message: "bad shape", details: "detail" },
      }),
    ),
  };
});

vi.mock("./env", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseEnv: () => ({ url: "https://x.supabase.co", key: "anon" }),
}));

vi.mock("@kinetech/core", () => ({
  createSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { supabase } from "./client";

beforeEach(() => {
  process.env.LOG_LEVEL = "info";
  vi.clearAllMocks();
});

describe("DB query timing (13.6.3)", () => {
  it("logs one structured line per query with timing, rows and Postgres fields", async () => {
    const info = vi.spyOn(globalThis.console as unknown as { info?: (text: string) => void }, "info").mockImplementation(() => {});
    try {
      const sb = supabase();
      expect(sb).not.toBeNull();

      const rows = await sb!.from("videos").select("id").eq("id", "v1");
      expect(rows.data).toEqual([{ id: "v1" }]);
      await sb!.rpc("complete_video", { p_video: "v1" });

      const lines = info.mock.calls.map((call) => String(call[0]));
      const okLine = lines.find((line) => line.includes('"event":"db.query.ok"'));
      const failLine = lines.find((line) => line.includes('"event":"db.query.failed"'));
      expect(okLine).toBeDefined();
      expect(failLine).toBeDefined();

      const ok = JSON.parse(String(okLine)) as Record<string, unknown>;
      expect(ok.module).toBe("db.client");
      expect(ok.msg).toBe("from.videos: ok");
      const okCtx = ok.ctx as Record<string, unknown>;
      expect(okCtx.label).toBe("from.videos");
      expect(okCtx.rows).toBe(1);
      expect(typeof okCtx.duration_ms).toBe("number");

      const bad = JSON.parse(String(failLine)) as Record<string, unknown>;
      const badCtx = bad.ctx as Record<string, unknown>;
      expect(badCtx.label).toBe("rpc.complete_video");
      expect(badCtx.postgres_code).toBe("42883");
      expect(badCtx.detail).toBe("detail");
      expect((bad.error as Record<string, unknown>).code).toBe("DB_001");
    } finally {
      info.mockRestore();
    }
  });
});
