import { describe, expect, it } from "vitest";
import { r2PlaylistUrl as adapterUrl } from "@kinetech/video-source";
import { r2PlaylistUrl as startUrl } from "../../../api/playback/start";
import { r2PlaylistUrl as refreshUrl } from "../../../api/playback/refresh";

/* The api functions are SELF-CONTAINED (Vercel's function bundler cannot load
 * workspace packages at runtime — FUNCTION_INVOCATION_FAILED), so the URL
 * builder exists in three places. This test keeps them identical. */
describe("r2 playlist url (drift guard)", () => {
  const worker = "https://kinetech-video.example.workers.dev/";
  const lesson = "11111111-2222-3333-4444-555555555555";
  const token = "body.signature";

  it("all three copies build the same URL", () => {
    const expected = `https://kinetech-video.example.workers.dev/v/${lesson}/index.m3u8?t=${token}`;
    expect(adapterUrl(worker, lesson, token)).toBe(expected);
    expect(startUrl(worker, lesson, token)).toBe(expected);
    expect(refreshUrl(worker, lesson, token)).toBe(expected);
  });

  it("a trailing slash on the worker url never doubles up", () => {
    expect(adapterUrl(worker, lesson, token)).toBe(
      adapterUrl(worker.replace(/\/+$/, ""), lesson, token),
    );
  });
});
