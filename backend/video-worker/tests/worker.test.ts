import { describe, expect, it } from "vitest";
import { signPlaybackToken, TOKEN_VERSION } from "@kinetech/playback-token";
import { handleRequest } from "../src/index";
import type { Env, R2BucketLike, R2ObjectBodyLike } from "../src/helpers";

const SECRET = "worker-test-secret";

/** A tiny in-memory stand-in for the R2 binding. */
function fakeBucket(files: Record<string, string>): R2BucketLike {
  return {
    async get(key: string, options?: { range?: { offset: number; length: number } }) {
      const value = files[key];
      if (value === undefined) return null;
      const bytes = new TextEncoder().encode(value);
      if (!options?.range) {
        const object: R2ObjectBodyLike = {
          body: new Response(bytes).body as ReadableStream,
          size: bytes.length,
        };
        return object;
      }
      const { offset, length } = options.range;
      const slice = bytes.slice(offset, offset + length);
      const object: R2ObjectBodyLike = {
        body: new Response(slice).body as ReadableStream,
        size: slice.length,
        range: { offset, length: slice.length },
      };
      return object;
    },
  };
}

const LESSON = "lesson-1";
const OTHER_LESSON = "lesson-2";

const FILES: Record<string, string> = {
  [`lessons/${LESSON}/index.m3u8`]: [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:10",
    '#EXT-X-KEY:METHOD=AES-128,URI="keys/lesson-1.key",IV=0x00',
    "#EXTINF:10.0,",
    "seg/seg000.ts",
    "#EXTINF:10.0,",
    "seg/seg001.ts",
    "",
  ].join("\n"),
  [`lessons/${LESSON}/seg/seg000.ts`]: "segment-zero-bytes",
  [`lessons/${LESSON}/seg/seg001.ts`]: "segment-one-bytes",
  [`keys/${LESSON}.key`]: "0123456789abcdef",
  [`keys/${OTHER_LESSON}.key`]: "other-lesson-key",
};

function env(): Env {
  return { VIDEOS: fakeBucket(FILES), GRANT_SECRET: SECRET };
}

async function tokenFor(lessonId: string, exp = 2_000_000_000): Promise<string> {
  return signPlaybackToken(
    {
      v: TOKEN_VERSION,
      lid: lessonId,
      uid: "user-1",
      did: "device-1",
      exp,
    },
    SECRET,
  );
}

async function get(path: string, token: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`https://worker.test${path}?t=${token}`, init), env());
}

describe("video worker", () => {
  it("serves the playlist with every URI carrying the token", async () => {
    const token = await tokenFor(LESSON);
    const res = await get(`/v/${LESSON}/index.m3u8`, token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    expect(res.headers.get("cache-control")).toBe("private, no-store");

    const body = await res.text();
    expect(body).toContain(`/v/${LESSON}/seg/seg000.ts?t=${token}`);
    expect(body).toContain(`/v/${LESSON}/seg/seg001.ts?t=${token}`);
    // The key URI is rewritten to the key route (and never to the raw path).
    expect(body).toContain(`/v/${LESSON}/key?t=${token}`);
    expect(body).not.toContain("keys/lesson-1.key");
  });

  it("serves a segment with the right type", async () => {
    const token = await tokenFor(LESSON);
    const res = await get(`/v/${LESSON}/seg/seg000.ts`, token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp2t");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(await res.text()).toBe("segment-zero-bytes");
  });

  it("answers a Range request with 206 and Content-Range", async () => {
    const token = await tokenFor(LESSON);
    const res = await get(`/v/${LESSON}/seg/seg000.ts`, token, {
      headers: { range: "bytes=0-5" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-5/18");
    expect(await res.text()).toBe("segmen");
  });

  it("serves the AES-128 key only through the key route", async () => {
    const token = await tokenFor(LESSON);
    const res = await get(`/v/${LESSON}/key`, token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).toBe("0123456789abcdef");
  });

  it("refuses a token issued for another lesson", async () => {
    const token = await tokenFor(OTHER_LESSON);
    const res = await get(`/v/${LESSON}/index.m3u8`, token);
    expect(res.status).toBe(403);
    // The body leaks nothing about the bucket.
    expect(await res.text()).toBe("Not authorized");
  });

  it("refuses another lesson's key", async () => {
    const token = await tokenFor(LESSON);
    const res = await get(`/v/${OTHER_LESSON}/key`, token);
    expect(res.status).toBe(403);
  });

  it("refuses an expired token", async () => {
    const token = await tokenFor(LESSON, 1_000);
    const res = await handleRequest(
      new Request(`https://worker.test/v/${LESSON}/index.m3u8?t=${token}`),
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("refuses a forged or missing token", async () => {
    const forged = await tokenFor(LESSON);
    const tampered = `${forged.slice(0, -3)}AAA`;
    expect((await get(`/v/${LESSON}/index.m3u8`, tampered)).status).toBe(403);
    expect(
      (await handleRequest(new Request(`https://worker.test/v/${LESSON}/index.m3u8`), env())).status,
    ).toBe(403);
  });

  it("accepts the previous secret while a rotation is in flight", async () => {
    const oldToken = await signPlaybackToken(
      { v: TOKEN_VERSION, lid: LESSON, uid: "u", did: "d", exp: 2_000_000_000 },
      "old-secret",
    );
    const rotated: Env = { ...env(), GRANT_SECRET: "new-secret", GRANT_SECRET_PREV: "old-secret" };
    const res = await handleRequest(
      new Request(`https://worker.test/v/${LESSON}/index.m3u8?t=${oldToken}`),
      rotated,
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for a missing object (never the key path of another lesson)", async () => {
    const token = await tokenFor(LESSON);
    const res = await get(`/v/${LESSON}/seg/missing.ts`, token);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  it("refuses a path traversal in the segment name", async () => {
    const token = await tokenFor(LESSON);
    const res = await handleRequest(
      new Request(`https://worker.test/v/${LESSON}/seg/${encodeURIComponent("../../keys/lesson-1.key")}?t=${token}`),
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("rate limits per token", async () => {
    const token = await tokenFor(LESSON);
    let limited = false;
    for (let i = 0; i < 200; i += 1) {
      const res = await get(`/v/${LESSON}/seg/seg000.ts`, token);
      if (res.status === 429) {
        limited = true;
        expect(res.headers.get("retry-after")).toBeTruthy();
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
