import { describe, expect, it } from "vitest";
import {
  TEST_VECTOR,
  signStreamToken,
  verifyStreamToken,
  type StreamTokenPayload,
} from "../src/token";

const SECRET = TEST_VECTOR.secret;
const NOW = 1_700_000_000;

function payload(overrides: Partial<StreamTokenPayload> = {}): StreamTokenPayload {
  return { ...TEST_VECTOR.payload, exp: NOW + 3600, ...overrides };
}

describe("worker token verify", () => {
  it("accepts a valid token", async () => {
    const token = await signStreamToken(payload(), SECRET);
    const out = await verifyStreamToken(token, SECRET, { now: NOW });
    expect(out).toMatchObject({
      uid: TEST_VECTOR.payload.uid,
      fid: TEST_VECTOR.payload.fid,
      exp: NOW + 3600,
    });
  });

  it("verifies the shared deterministic vector", async () => {
    const out = await verifyStreamToken(TEST_VECTOR.token, TEST_VECTOR.secret, { now: NOW });
    expect(out?.fid).toBe(TEST_VECTOR.payload.fid);
    const reSigned = await signStreamToken(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(reSigned).toBe(TEST_VECTOR.token);
  });

  it("rejects an expired token", async () => {
    const token = await signStreamToken(payload({ exp: NOW - 1 }), SECRET);
    expect(await verifyStreamToken(token, SECRET, { now: NOW })).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signStreamToken(payload(), SECRET);
    const [body, sig] = token.split(".");
    const decoded = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    decoded.fid = "someone-elses-file";
    const forged = btoa(JSON.stringify(decoded))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyStreamToken(`${forged}.${sig}`, SECRET, { now: NOW })).toBeNull();
  });

  it("rejects a tampered signature and the wrong secret", async () => {
    const token = await signStreamToken(payload(), SECRET);
    const [body, sig] = token.split(".");
    expect(await verifyStreamToken(`${body}.${sig.slice(0, -2)}AA`, SECRET, { now: NOW })).toBeNull();
    expect(await verifyStreamToken(token, "another-secret", { now: NOW })).toBeNull();
  });

  it("rejects malformed tokens and a wrong version", async () => {
    expect(await verifyStreamToken("", SECRET, { now: NOW })).toBeNull();
    expect(await verifyStreamToken("nodot", SECRET, { now: NOW })).toBeNull();
    expect(await verifyStreamToken("a.b.c", SECRET, { now: NOW })).toBeNull();
    const wrongVersion = await signStreamToken(
      { ...payload(), v: 2 as unknown as 1 },
      SECRET,
    );
    expect(await verifyStreamToken(wrongVersion, SECRET, { now: NOW })).toBeNull();
  });
});
