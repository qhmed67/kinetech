import { afterEach, describe, expect, it, vi } from "vitest";
import { clearMetaCache, fetchDriveMeta, fetchDriveRange } from "../src/drive";
import { fetchRangeWithPool, type Counters, type Env } from "../src/index";

afterEach(() => {
  clearMetaCache();
  vi.unstubAllGlobals();
});

const KEY_AUTH = { kind: "key" as const, key: "AIzaTest" };

function counters(): Counters {
  return { drive_fetches: 0, cache_hits: 0, cache_misses: 0, quota_errors: 0, bytes_served: 0 };
}

function quotaBody(reason: string): Response {
  return new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status: 403 });
}

describe("fetchDriveRange", () => {
  it("returns the bytes of a 206", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 206 }));
    const out = await fetchDriveRange("f", 0, 2, KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(new Uint8Array(out.body)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("classifies 403 as quota with the Drive reason", async () => {
    const fetchImpl = vi.fn(async () => quotaBody("userRateLimitExceeded"));
    const out = await fetchDriveRange("f", 0, 2, KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: "quota", reason: "drive_403", drive_reason: "userRateLimitExceeded" });
  });

  it("classifies 5xx as drive_5xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 503 }));
    const out = await fetchDriveRange("f", 0, 2, KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: "error", reason: "drive_5xx" });
  });

  it("classifies 401 as auth", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    const out = await fetchDriveRange("f", 0, 2, KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(out.kind).toBe("auth");
  });

  it("refuses a 200 that ignored Range (would buffer the whole file)", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array(10), {
          status: 200,
          headers: { "content-length": "999999999" },
        }),
    );
    const out = await fetchDriveRange("f", 0, 2, KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: "error", reason: "range_ignored" });
  });
});

describe("fetchDriveMeta", () => {
  it("reads size and mime type, then serves the second call from cache", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ mimeType: "video/mp4", size: "12345" }), { status: 200 }),
    );
    const first = await fetchDriveMeta("f-meta", KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(first).toEqual({ kind: "ok", meta: { size: 12345, mimeType: "video/mp4" } });

    const failing = vi.fn(async () => new Response("boom", { status: 500 }));
    const second = await fetchDriveMeta("f-meta", KEY_AUTH, failing as unknown as typeof fetch);
    expect(second).toEqual({ kind: "ok", meta: { size: 12345, mimeType: "video/mp4" } });
    expect(failing).not.toHaveBeenCalled();
  });

  it("rejects a file without a size", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ mimeType: "video/mp4" })));
    const out = await fetchDriveMeta("f-nosize", KEY_AUTH, fetchImpl as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: "error", reason: "meta_failed" });
  });
});

describe("credential-pool fallback", () => {
  const env: Env = {
    STREAM_TOKEN_SECRET: "s",
    DRIVE_CREDENTIALS: JSON.stringify([
      { type: "apikey", key: "k1" },
      { type: "apikey", key: "k2" },
    ]),
    ALLOWED_ORIGINS: "",
  };

  it("retries the next credential once on 403 and succeeds", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      if (urls.length === 1) return quotaBody("userRateLimitExceeded");
      return new Response(new Uint8Array([7, 8]), { status: 206 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const c = counters();
    const out = await fetchRangeWithPool(env, "file-x", 0, 1, c);
    expect(out.kind).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urls[0]).not.toBe(urls[1]); // a different key was used
    expect(c.quota_errors).toBe(1);
  });

  it("reports quota when every credential is exhausted", async () => {
    const fetchMock = vi.fn(async () => quotaBody("dailyLimitExceeded"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchRangeWithPool(env, "file-y", 0, 1, counters());
    expect(out.kind).toBe("quota");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports quota when no credential is configured", async () => {
    const out = await fetchRangeWithPool(
      { ...env, DRIVE_CREDENTIALS: "[]" },
      "file-z",
      0,
      1,
      counters(),
    );
    expect(out.kind).toBe("quota");
  });
});
