import { describe, expect, it } from "vitest";
import {
  signPlaybackToken,
  TEST_VECTOR,
  TOKEN_VERSION,
  verifyPlaybackToken,
  type PlaybackTokenPayload,
} from "./index";

const payload: PlaybackTokenPayload = {
  v: TOKEN_VERSION,
  lid: "lesson-1",
  uid: "user-1",
  did: "device-1",
  exp: 2_000_000_000,
};

describe("playback token", () => {
  it("signs and verifies a token", async () => {
    const token = await signPlaybackToken(payload, "s3cret");
    const verified = await verifyPlaybackToken(token, "s3cret");
    expect(verified).toEqual(payload);
  });

  it("carries ids only — no urls, no storage keys", async () => {
    const token = await signPlaybackToken(payload, "s3cret");
    const body = token.split(".")[0];
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(["did", "exp", "lid", "uid", "v"]);
    expect(json).not.toMatch(/https?:\/\//);
    expect(json).not.toMatch(/lessons\//);
  });

  it("rejects an expired token", async () => {
    const token = await signPlaybackToken({ ...payload, exp: 1_000 }, "s3cret");
    const verified = await verifyPlaybackToken(token, "s3cret", { now: 2_000 });
    expect(verified).toBeNull();
  });

  it("rejects a token issued for another lesson", async () => {
    const token = await signPlaybackToken(payload, "s3cret");
    expect(await verifyPlaybackToken(token, "s3cret", { lessonId: "lesson-2" })).toBeNull();
    expect(await verifyPlaybackToken(token, "s3cret", { lessonId: "lesson-1" })).not.toBeNull();
  });

  it("rejects a wrong secret, a tampered body and a tampered signature", async () => {
    const token = await signPlaybackToken(payload, "s3cret");
    expect(await verifyPlaybackToken(token, "other")).toBeNull();

    const [body, signature] = token.split(".");
    const tamperedBody = `${body.slice(0, -2)}AA.${signature}`;
    expect(await verifyPlaybackToken(tamperedBody, "s3cret")).toBeNull();
    expect(await verifyPlaybackToken(`${body}.${signature.slice(0, -2)}AA`, "s3cret")).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyPlaybackToken("", "s3cret")).toBeNull();
    expect(await verifyPlaybackToken("no-dot", "s3cret")).toBeNull();
    expect(await verifyPlaybackToken("a.b.c", "s3cret")).toBeNull();
    expect(await verifyPlaybackToken("!!!.???", "s3cret")).toBeNull();
  });

  it("keeps the shared test vector stable (both implementations must agree)", async () => {
    const signed = await signPlaybackToken(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(signed).toBe(TEST_VECTOR.token);
    expect(await verifyPlaybackToken(TEST_VECTOR.token, TEST_VECTOR.secret)).toEqual(
      TEST_VECTOR.payload,
    );
  });
});
