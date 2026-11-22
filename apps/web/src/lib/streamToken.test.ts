import { describe, expect, it } from "vitest";
import {
  STREAM_TOKEN_TTL_SECONDS,
  TEST_VECTOR,
  encryptFid,
  decryptFid,
  signStreamToken,
  verifyStreamToken,
  type SignedStreamTokenPayload,
} from "./streamToken";

const SECRET = TEST_VECTOR.secret;
const NOW = 1_700_000_000;

function signed(overrides: Partial<SignedStreamTokenPayload> = {}): SignedStreamTokenPayload {
  return { ...TEST_VECTOR.payload, exp: NOW + 3600, ...overrides } as SignedStreamTokenPayload;
}

describe("stream token sign/verify", () => {
  it("signs and verifies the shared deterministic vector", async () => {
    const token = await signStreamToken(TEST_VECTOR.payload, TEST_VECTOR.secret);
    expect(token).toBe(TEST_VECTOR.token);
    const out = await verifyStreamToken(TEST_VECTOR.token, TEST_VECTOR.secret, { now: NOW });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.fid).toBe(TEST_VECTOR.fid);
      expect(out.payload.uid).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      expect(out.payload.exp).toBe(2000000000);
    }
  });

  it("round-trips an encrypted fid", async () => {
    const efid = await encryptFid(TEST_VECTOR.fid, SECRET);
    expect(await decryptFid(efid, SECRET)).toBe(TEST_VECTOR.fid);
    // A fresh encryption of the same fid has a different IV/ciphertext.
    const again = await encryptFid(TEST_VECTOR.fid, SECRET);
    expect(again.ct).not.toBe(efid.ct);
  });

  it("rejects tampered ciphertext or iv", async () => {
    const efid = await encryptFid(TEST_VECTOR.fid, SECRET);
    const tamperedC = { ...efid, ct: efid.ct.slice(0, -2) + (efid.ct.endsWith("AA") ? "BB" : "AA") };
    expect(await decryptFid(tamperedC, SECRET)).toBe(null);
    const tamperedI = { ...efid, iv: efid.iv.slice(0, -2) + (efid.iv.endsWith("AA") ? "BB" : "AA") };
    expect(await decryptFid(tamperedI, SECRET)).toBe(null);
  });

  it("signs and verifies a fresh v2 token", async () => {
    const token = await signStreamToken(signed(), SECRET);
    const out = await verifyStreamToken(token, SECRET, { now: NOW });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload.fid).toBe(TEST_VECTOR.fid);
  });

  it("rejects an expired token", async () => {
    const token = await signStreamToken(signed({ exp: NOW - 1 }), SECRET);
    expect((await verifyStreamToken(token, SECRET, { now: NOW })).ok).toBe(false);
  });

  it("rejects tampered payload and signature", async () => {
    const token = await signStreamToken(signed(), SECRET);
    const [body, sig] = token.split(".");
    const decoded = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as {
      efid: { iv: string; ct: string };
    };
    decoded.efid.ct = decoded.efid.ct.slice(0, -2) + "AA";
    const forgedBody = btoa(JSON.stringify(decoded)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect((await verifyStreamToken(`${forgedBody}.${sig}`, SECRET, { now: NOW })).ok).toBe(false);
    expect((await verifyStreamToken(`${body}.${sig.slice(0, -2)}AA`, SECRET, { now: NOW })).ok).toBe(false);
  });

  it("rejects the wrong secret and malformed tokens", async () => {
    const token = await signStreamToken(signed(), SECRET);
    expect((await verifyStreamToken(token, "another-secret", { now: NOW })).ok).toBe(false);
    expect((await verifyStreamToken("", SECRET, { now: NOW })).ok).toBe(false);
    expect((await verifyStreamToken("a.b.c", SECRET, { now: NOW })).ok).toBe(false);
    expect((await verifyStreamToken("nodot", SECRET, { now: NOW })).ok).toBe(false);
  });

  it("honours the configured TTL", () => {
    expect(STREAM_TOKEN_TTL_SECONDS).toBe(3600);
  });
});
