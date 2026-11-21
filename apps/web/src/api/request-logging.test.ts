import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import accountDelete from "../../api/account-delete.ts";
import play from "../../api/play.ts";
import playbackRefresh from "../../api/playback/refresh.ts";
import playbackStart from "../../api/playback/start.ts";
import sessionRegister from "../../api/session-register.ts";

type Handler = (
  req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown },
  res: {
    status: (code: number) => unknown;
    json: (body: unknown) => unknown;
    setHeader?: (name: string, value: string) => void;
  },
) => Promise<unknown>;

type Req = Parameters<Handler>[0];
type Res = Parameters<Handler>[1];

const CASES: Array<[string, Handler]> = [
  ["/api/account-delete", accountDelete as unknown as Handler],
  ["/api/play", play as unknown as Handler],
  ["/api/playback/refresh", playbackRefresh as unknown as Handler],
  ["/api/playback/start", playbackStart as unknown as Handler],
  ["/api/session-register", sessionRegister as unknown as Handler],
];

function capture() {
  const seen: { code?: number; payload?: Record<string, unknown> } = {};
  const res: Res = {
    status(code) {
      seen.code = code;
      return res;
    },
    json(body) {
      seen.payload = body as Record<string, unknown>;
      return body;
    },
  };
  return { res, seen };
}

beforeEach(() => {
  process.env.LOG_LEVEL = "info";
});

describe("structured logging on every API route (13.6.2)", () => {
  for (const [route, handler] of CASES) {
    it(`${route} emits a correlated request line and error payload`, async () => {
      const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      try {
        const req: Req = { method: "GET", headers: { "x-request-id": "req_route" }, body: {} };
        const { res, seen } = capture();
        await handler(req, res);

        const line = write.mock.calls
          .map((call) => String(call[0]))
          .find((text) => text.includes("api.request.end"));
        expect(line, `${route} did not log api.request.end`).toBeDefined();

        const rec = JSON.parse(String(line)) as Record<string, unknown>;
        expect(rec.correlation_id).toBe("req_route");
        expect(rec.event).toBe("api.request.end");
        expect((rec.ctx as Record<string, unknown>).route).toBe(route);
        expect((rec.ctx as Record<string, unknown>).status).toBe(405);
        for (const key of ["ts", "level", "service", "env", "version", "module", "msg"]) {
          expect(rec[key], `${route} line missing ${key}`).toBeDefined();
        }
        expect((seen.payload as Record<string, unknown>).correlation_id).toBe("req_route");
      } finally {
        write.mockRestore();
      }
    });
  }
});
