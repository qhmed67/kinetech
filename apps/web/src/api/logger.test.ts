import { beforeEach, describe, expect, it } from "vitest";
import { configure, currentCorrelationId, log, newRequestId, requestIdFromHeaders, withCorrelation } from "../../api/_logger.ts";

let lines: string[];

function records() {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(() => {
  lines = [];
  configure({
    service: "kinetech-test",
    env: "test",
    version: "test-sha",
    min: "debug",
    sink: (line) => {
      lines.push(line);
    },
  });
});

describe("server logger (13.6.1)", () => {
  it("emits the docs/LOGGING.md schema with the active correlation id", () => {
    withCorrelation("req_abc", () => {
      log("error", "api.play.denied", "playback denied", {
        module: "api.play",
        code: "PLAY_001",
        ctx: { videoId: "v1" },
      });
    });

    expect(currentCorrelationId()).toBeUndefined();
    const rec = records()[0];
    for (const key of ["ts", "level", "service", "env", "version", "module", "event", "msg"]) {
      expect(rec[key]).toBeDefined();
    }
    expect(rec.correlation_id).toBe("req_abc");
    expect(rec.level).toBe("error");
    expect((rec.error as Record<string, unknown>).code).toBe("PLAY_001");
    expect((rec.ctx as Record<string, unknown>).videoId).toBe("v1");
  });

  it("redacts secrets, PII and media locations from ctx and error text", () => {
    log("error", "api.play.failed", "Bearer abc failed for https://x/y?video=a&t=secret", {
      module: "api.play",
      ctx: {
        password: "p",
        authorization: "Bearer abc",
        api_key: "k",
        email: "a@b.com",
        phone: "0100000000",
        embedUrl: "https://drive.example/file",
        nested: { token: "abc", safe: "ok" },
      },
      error: new Error("failed with token=abc123 at https://cdn.example/key"),
    });

    const rec = records()[0];
    expect(JSON.stringify(rec)).not.toMatch(/abc123|cdn\.example|drive\.example|a@b\.com|0100000000|Bearer abc/);
    const ctx = rec.ctx as Record<string, Record<string, unknown> | string>;
    expect(ctx.password).toBe("[REDACTED]");
    expect(ctx.embedUrl).toBe("[REDACTED]");
    expect(ctx.nested).toEqual({ token: "[REDACTED]", safe: "ok" });
    expect((rec.error as Record<string, unknown>).code).toBe("SYS_001");
  });

  it("accepts valid request ids and generates a safe one otherwise", () => {
    expect(requestIdFromHeaders({ "x-request-id": "req_123" })).toBe("req_123");
    expect(requestIdFromHeaders({ "X-Correlation-ID": ["req_456"] })).toBe("req_456");
    expect(requestIdFromHeaders({ "x-request-id": "bad id?" })).toMatch(/^req_[A-Za-z0-9._-]+$/);
    expect(newRequestId()).toMatch(/^req_[A-Za-z0-9._-]+$/);
  });

  it("respects the level threshold and never throws on bad ctx or a broken sink", () => {
    configure({ min: "warn", sink: (line) => { lines.push(line); } });
    log("info", "api.play.start", "ignored", { module: "api.play" });
    expect(lines).toHaveLength(0);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => log("warn", "api.play.circular", "ctx", { module: "api.play", ctx: circular })).not.toThrow();
    expect(records()[0].ctx).toEqual({ self: "[CIRCULAR]" });

    configure({ sink: () => { throw new Error("sink down"); } });
    expect(() => log("error", "api.play.broken", "still safe", { module: "api.play" })).not.toThrow();
  });
});
