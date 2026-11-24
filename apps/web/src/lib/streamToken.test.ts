import { describe, expect, it } from "vitest";
import {
  MIN_REFRESH_LEAD_MS,
  REFRESH_LEAD_MS,
  STREAM_TOKEN_TTL_SECONDS,
  TEST_VECTOR,
  clampStreamTokenTtl,
  encryptFid,
  decryptFid,
  refreshLeadMs,
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

describe("stream token lifetime clamping", () => {
  it("keeps a value inside the signing window", () => {
    expect(clampStreamTokenTtl(3600)).toBe(3600);
    expect(clampStreamTokenTtl({ seconds: 900 })).toBe(900);
  });

  it("clamps too short and too long values to the window edges", () => {
    expect(clampStreamTokenTtl(60)).toBe(300);
    expect(clampStreamTokenTtl({ seconds: 99999 })).toBe(7200);
  });

  it("falls back to the default when the setting is missing or broken", () => {
    expect(clampStreamTokenTtl(null)).toBe(STREAM_TOKEN_TTL_SECONDS);
    expect(clampStreamTokenTtl(undefined)).toBe(STREAM_TOKEN_TTL_SECONDS);
    expect(clampStreamTokenTtl("")).toBe(STREAM_TOKEN_TTL_SECONDS);
    expect(clampStreamTokenTtl("not-a-number")).toBe(STREAM_TOKEN_TTL_SECONDS);
    expect(clampStreamTokenTtl({})).toBe(STREAM_TOKEN_TTL_SECONDS);
  });
});

describe("worker token refresh lead", () => {
  it("refreshes a fifth of the lifetime before it expires", () => {
    // 1 h lifetime -> 12 min lead, capped at the fixed 5 min lead.
    expect(refreshLeadMs(3600)).toBe(REFRESH_LEAD_MS);
    // 10 min lifetime -> 2 min lead (a fifth, inside the bounds).
    expect(refreshLeadMs(600)).toBe(120_000);
  });

  it("never refreshes earlier than 30 s, so a short token cannot loop", () => {
    // A 5-minute token would lead to a 60 s lead (a fifth of the lifetime);
    // below 150 s the lead is floored at 30 s.
    expect(refreshLeadMs(300)).toBe(60_000);
    expect(refreshLeadMs(150)).toBe(MIN_REFRESH_LEAD_MS);
    expect(refreshLeadMs(60)).toBe(MIN_REFRESH_LEAD_MS);
  });

  it("falls back to the fixed lead when the lifetime is unknown", () => {
    expect(refreshLeadMs(0)).toBe(REFRESH_LEAD_MS);
    expect(refreshLeadMs(-1)).toBe(REFRESH_LEAD_MS);
    expect(refreshLeadMs(Number.NaN)).toBe(REFRESH_LEAD_MS);
  });
});
