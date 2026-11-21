import { describe, expect, it } from "vitest";
import { verifyPlaybackToken } from "@kinetech/playback-token";
import { DriveSource, kindOf, R2Source, sourceFor } from "./index";

const SECRET = "server-test-secret";
const WORKER = "https://video.example.workers.dev";

const context = {
  secret: SECRET,
  workerUrl: WORKER,
  userId: "user-1",
  deviceId: "device-1",
  now: 1_700_000_000,
};

describe("video sources", () => {
  it("r2 resolves to a worker URL with a token bound to the lesson, user and device", async () => {
    const target = await new R2Source().resolve(
      { videoId: "lesson-1", source: "r2" },
      context,
    );
    expect(target.kind).toBe("url");
    if (target.kind !== "url") return;
    expect(target.url.startsWith(`${WORKER}/v/lesson-1/index.m3u8?t=`)).toBe(true);

    const token = new URL(target.url).searchParams.get("t") ?? "";
    const payload = await verifyPlaybackToken(token, SECRET, {
      lessonId: "lesson-1",
      now: context.now,
    });
    expect(payload).toEqual({
      v: 1,
      lid: "lesson-1",
      uid: "user-1",
      did: "device-1",
      exp: 1_700_000_000 + 2 * 60 * 60,
    });
    // The token is bound to THIS lesson only.
    expect(
      await verifyPlaybackToken(token, SECRET, { lessonId: "lesson-2", now: context.now }),
    ).toBeNull();
  });

  it("the token expires after its ttl", async () => {
    const target = await new R2Source().resolve(
      { videoId: "lesson-1", source: "r2" },
      { ...context, ttlSeconds: 60 },
    );
    if (target.kind !== "url") throw new Error("expected a url");
    const token = new URL(target.url).searchParams.get("t") ?? "";
    expect(await verifyPlaybackToken(token, SECRET, { now: 1_700_000_061 })).toBeNull();
  });

  it("drive resolves to 'not natively playable' (never a raw link)", async () => {
    const target = await new DriveSource().resolve(
      { videoId: "lesson-1", source: "drive", srcUrl: "https://drive.google.com/file/d/abc" },
      context,
    );
    expect(target).toEqual({ kind: "unsupported", code: "NATIVE_UNSUPPORTED_SOURCE" });
  });

  it("fails closed when the server is misconfigured", async () => {
    const target = await new R2Source().resolve(
      { videoId: "lesson-1", source: "r2" },
      { ...context, secret: "", workerUrl: "" },
    );
    expect(target.kind).toBe("unsupported");
  });

  it("reads the provider from the source column, or from the marker", () => {
    expect(kindOf({ source: "r2" })).toBe("r2");
    expect(kindOf({ source: "drive" })).toBe("drive");
    expect(kindOf({ srcUrl: "r2:lesson-1" })).toBe("r2");
    expect(kindOf({ srcUrl: "https://drive.google.com/file/d/abc" })).toBe("drive");
    expect(kindOf({})).toBe("drive");
  });

  it("picks the implementation per lesson — a new provider only registers here", () => {
    expect(sourceFor("r2").kind).toBe("r2");
    expect(sourceFor("drive").kind).toBe("drive");
    expect(sourceFor(null).kind).toBe("drive");
    expect(sourceFor("something-new").kind).toBe("drive");
  });
});
