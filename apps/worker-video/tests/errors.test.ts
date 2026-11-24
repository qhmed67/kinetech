import { describe, expect, it } from "vitest";
import worker, { checkOriginAllowed, errorBody, type Env, type ErrorBody } from "../src/index";

const ENV: Env = {
  STREAM_TOKEN_SECRET: "test-secret",
  DRIVE_CREDENTIALS: JSON.stringify([{ type: "apikey", key: "AIzaTest" }]),
  ALLOWED_ORIGINS: "https://kinetechtest.vercel.app, https://*.vercel.app",
};

function ctx(): ExecutionContext {
  return { waitUntil: () => undefined } as unknown as ExecutionContext;
}

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

type HealthVerboseBody = {
  ok: boolean;
  name: string;
  cache: string;
  version?: string;
  secrets: {
    STREAM_TOKEN_SECRET: { present: boolean };
    DRIVE_CREDENTIALS: { present: boolean; parses: boolean; shape: string; enabledCount: number };
    ALLOWED_ORIGINS: { present: boolean; count: number; wildcardCount: number };
  };
};

describe("error body shape", () => {
  it("has error, reason, upstream_status, drive_reason", async () => {
    const res = errorBody({
      status: 502,
      error: "upstream",
      reason: "drive_404",
      cors: {},
      upstreamStatus: 404,
      driveReason: "notFound",
      stage: "meta",
    });
    expect(res.status).toBe(502);
    expect(await json<ErrorBody>(res)).toEqual({
      error: "upstream",
      reason: "drive_404",
      upstream_status: 404,
      drive_reason: "notFound",
      stage: "meta",
    });
  });

  it("omits stage when not set", async () => {
    const res = errorBody({ status: 401, error: "unauthorized", reason: "bad_signature", cors: {} });
    expect((await json<ErrorBody>(res)).stage).toBeUndefined();
  });

  it("adds retry-after on quota 503s and keeps CORS headers", () => {
    const res = errorBody({
      status: 503,
      error: "quota",
      reason: "drive_403",
      cors: { "access-control-allow-origin": "https://kinetechtest.vercel.app" },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://kinetechtest.vercel.app");
  });
});

describe("checkOriginAllowed", () => {
  it("matches the preview origin via the wildcard", () => {
    const patterns = ["https://kinetechtest.vercel.app", "https://*.vercel.app"];
    expect(checkOriginAllowed("https://kinetechtest.vercel.app", patterns)).toBe(true);
    expect(
      checkOriginAllowed("https://kinetechtest-aggtkiwi5-owner-team-scope-placeholder.vercel.app", patterns),
    ).toBe(true);
    expect(checkOriginAllowed("https://evilvercel.app", patterns)).toBe(false);
    expect(checkOriginAllowed("", patterns)).toBe(false);
  });
});

describe("worker routes (integration)", () => {
  it("GET /health?verbose=1 reports booleans and counts only", async () => {
    const res = await worker.fetch(new Request("https://w/health?verbose=1"), ENV, ctx());
    expect(res.status).toBe(200);
    const body = await json<HealthVerboseBody>(res);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("kinetech-video-test");
    expect(body.secrets.STREAM_TOKEN_SECRET).toEqual({ present: true });
    expect(body.secrets.DRIVE_CREDENTIALS).toMatchObject({
      present: true,
      parses: true,
      shape: "array",
      enabledCount: 1,
    });
    expect(body.secrets.ALLOWED_ORIGINS).toMatchObject({ present: true, count: 2, wildcardCount: 1 });
  });

  it("GET /health returns ok + cache state", async () => {
    const res = await worker.fetch(new Request("https://w/health"), ENV, ctx());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("kinetech-video-test");
    expect(["available", "unavailable"]).toContain(body.cache);
  });

  it("GET /check-origin?o=<origin> answers {allowed}", async () => {
    const ok = await worker.fetch(new Request("https://w/check-origin?o=https://kinetechtest.vercel.app"), ENV, ctx());
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({ allowed: true });
    const bad = await worker.fetch(new Request("https://w/check-origin?o=https://evil.example"), ENV, ctx());
    expect(await json(bad)).toEqual({ allowed: false });
  });

  it("GET /v?t=bad returns 401 with a reason", async () => {
    const res = await worker.fetch(new Request("https://w/v?t=bad"), ENV, ctx());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("unauthorized");
    expect(body.reason).toBe("bad_token_format");
    expect(body.upstream_status).toBe(null);
  });

  it("GET /v with a foreign Origin returns 403 origin_not_allowed", async () => {
    const res = await worker.fetch(
      new Request("https://w/v?t=bad", { headers: { origin: "https://evil.example" } }),
      ENV,
      ctx(),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("origin");
    expect(body.reason).toBe("origin_not_allowed");
  });

  it("GET /v with a same-origin Origin is allowed (401 for the bad token)", async () => {
    const res = await worker.fetch(
      new Request("https://w/v?t=bad", { headers: { origin: "https://kinetechtest.vercel.app" } }),
      ENV,
      ctx(),
    );
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("bad_token_format");
  });
});
