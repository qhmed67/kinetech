import { describe, expect, it } from "vitest";
import {
  STREAM_TOKEN_TTL_SECONDS,
  TEST_VECTOR,
  signStreamToken,
  verifyStreamToken,
  type StreamTokenPayload,
} from "./streamToken";

const SECRET = TEST_VECTOR.secret;
const NOW = 1_700_000_000;

function payload(overrides: Partial<StreamTokenPayload> = {}): StreamTokenPayload {
  return { ...TEST_VECTOR.payload, exp: NOW + 3600, ...overrides };
}

describe("stream token sign/verify", () => {
  it("accepts a valid token", async () => {
    const token = await signStreamToken(payload(), SECRET);
    const out = await verifyStreamToken(token, SECRET, { now: NOW });
    expect(out).toMatchObject({
      uid: TEST_VECTOR.payload.uid,
      fid: TEST_VECTOR.payload.fid,
      exp: NOW + 3600,
    });
  });

  it("matches the shared deterministic vector", async () => {
    const token = await signStreamToken(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(token).toBe(TEST_VECTOR.token);
    expect(await verifyStreamToken(TEST_VECTOR.token, TEST_VECTOR.secret, { now: NOW })).not.toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signStreamToken(payload({ exp: NOW - 1 }), SECRET);
    expect(await verifyStreamToken(token, SECRET, { now: NOW })).toBeNull();
  });

  it("rejects a tampered payload and a tampered signature", async () => {
    const token = await signStreamToken(payload(), SECRET);
    const [body, sig] = token.split(".");
    const decoded = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    decoded.fid = "someone-elses-file";
    const forgedBody = btoa(JSON.stringify(decoded)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyStreamToken(`${forgedBody}.${sig}`, SECRET, { now: NOW })).toBeNull();
    const badSig = `${body}.${sig.slice(0, -2)}AA`;
    expect(await verifyStreamToken(badSig, SECRET, { now: NOW })).toBeNull();
  });

  it("rejects the wrong secret and malformed tokens", async () => {
    const token = await signStreamToken(payload(), SECRET);
    expect(await verifyStreamToken(token, "another-secret", { now: NOW })).toBeNull();
    expect(await verifyStreamToken("", SECRET, { now: NOW })).toBeNull();
    expect(await verifyStreamToken("a.b.c", SECRET, { now: NOW })).toBeNull();
    expect(await verifyStreamToken("nodot", SECRET, { now: NOW })).toBeNull();
  });

  it("honours the configured TTL", () => {
    expect(STREAM_TOKEN_TTL_SECONDS).toBe(3600);
  });
});
