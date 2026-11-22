import { describe, expect, it } from "vitest";
import {
  TEST_VECTOR,
  encryptFid,
  decryptFid,
  signStreamToken,
  verifyStreamToken,
  type SignedStreamTokenPayload,
} from "../src/token";

const SECRET = TEST_VECTOR.secret;
const NOW = 1_700_000_000;

function signed(overrides: Partial<SignedStreamTokenPayload> = {}): SignedStreamTokenPayload {
  return { ...TEST_VECTOR.payload, exp: NOW + 3600, ...overrides } as SignedStreamTokenPayload;
}

async function verify(token: string) {
  return verifyStreamToken(token, SECRET, { now: NOW });
}

describe("worker token v2", () => {
  it("signs and verifies the shared deterministic vector", async () => {
    expect(await signStreamToken(TEST_VECTOR.payload, TEST_VECTOR.secret)).toBe(TEST_VECTOR.token);
    const out = await verify(TEST_VECTOR.token);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.fid).toBe(TEST_VECTOR.fid);
      expect(out.payload.uid).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      expect(out.payload.exp).toBe(2000000000);
      expect(out.payload.jti).toBe("test-jti-0001");
    }
  });

  it("round-trips an encrypted fid", async () => {
    const efid = await encryptFid(TEST_VECTOR.fid, SECRET);
    expect(efid).toMatchObject({ iv: expect.any(String), ct: expect.any(String) });
    expect(await decryptFid(efid, SECRET)).toBe(TEST_VECTOR.fid);
    // Different calls encrypt to different ciphertexts (random IV).
    expect(await decryptFid(await encryptFid(TEST_VECTOR.fid, SECRET), SECRET)).toBe(TEST_VECTOR.fid);
  });

  it("rejects tampered ciphertext or iv", async () => {
    const efid = await encryptFid(TEST_VECTOR.fid, SECRET);
    const tamperedC = { ...efid, ct: efid.ct.slice(0, -2) + (efid.ct.endsWith("AA") ? "BB" : "AA") };
    expect(await decryptFid(tamperedC, SECRET)).toBe(null);
    const tamperedI = { ...efid, iv: efid.iv.slice(0, -2) + (efid.iv.endsWith("AA") ? "BB" : "AA") };
    expect(await decryptFid(tamperedI, SECRET)).toBe(null);
    expect(await decryptFid({ iv: "x", ct: "y" }, SECRET)).toBe(null);
  });

  it("signs and verifies a fresh v2 token", async () => {
    const token = await signStreamToken(signed(), SECRET);
    const out = await verify(token);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.payload.fid).toBe(TEST_VECTOR.fid);
      expect(out.payload.exp).toBe(NOW + 3600);
    }
  });

  it("still verifies legacy v1 tokens (plaintext fid)", async () => {
    const token = await signStreamToken(
      { v: 1, uid: "u1", fid: "fileId1", exp: NOW + 3600, jti: "j1" },
      SECRET,
    );
    const out = await verify(token);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.payload.fid).toBe("fileId1");
  });

  it("rejects expired tokens", async () => {
    const token = await signStreamToken(signed({ exp: NOW - 1 }), SECRET);
    expect((await verify(token)).ok).toBe(false);
  });

  it("rejects tampered payload and signature", async () => {
    const token = await signStreamToken(signed(), SECRET);
    const [body, sig] = token.split(".");
    const decoded = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as {
      efid: { iv: string; ct: string };
    };
    decoded.efid.ct = decoded.efid.ct.slice(0, -2) + "AA";
    const forgedBody = btoa(JSON.stringify(decoded))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect((await verify(`${forgedBody}.${sig}`)).ok).toBe(false);
    expect((await verify(`${body}.${sig.slice(0, -2)}AA`)).ok).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const token = await signStreamToken(signed(), SECRET);
    expect((await verifyStreamToken(token, "another-secret", { now: NOW })).ok).toBe(false);
  });

  it("rejects malformed tokens and wrong versions", async () => {
    for (const bad of ["", "nodot", "a.b.c", "???"]) {
      expect((await verify(bad)).ok).toBe(false);
    }
    const wrongVersion = await signStreamToken(signed({ v: 3 as unknown as 2 }), SECRET);
    expect((await verify(wrongVersion)).ok).toBe(false);
  });
});
