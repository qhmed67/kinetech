/* Stream token — v2: the signed payload carries an AES-GCM-encrypted Drive
 * file id, so the raw id never appears in a token a student can read.
 *
 * Format: { v, uid, efid: { iv, ct }, exp, jti } — HMAC-SHA256 over the
 * base64url body, WebCrypto only, constant-time via crypto.subtle.verify.
 * The Drive id is decrypted server-side (the Worker) or not at all (the
 * web client); the id lives in the payload, never in a URL.
 *
 * Encryption: AES-GCM-256, key = HKDF-SHA256(secret, salt, info), random 12-
 * byte IV, authenticated. Decryption failure = tamper/wrong secret → the
 * verify result is bad_signature.
 *
 * Legacy v1 tokens ({ v:1, uid, fid, exp, jti } — plaintext fid) still
 * verify: they were signed by the same secret and expire within the hour.
 *
 * This file is the Worker's copy of apps/web/src/lib/streamToken.ts. The
 * shared TEST_VECTOR (asserted by tests/token.test.ts and the web copies'
 * tests) keeps the copies in sync.
 */

export const STREAM_TOKEN_VERSION = 2 as const;

export type EncryptedFid = { iv: string; ct: string };

/** Signed payload — v2 (encrypted fid) or v1 (legacy plaintext fid). */
export type SignedStreamTokenPayload =
  | { v: 1; uid: string; fid: string; exp: number; jti: string }
  | { v: 2; uid: string; efid: EncryptedFid; exp: number; jti: string };

/** What a token verifies to: the id the Worker streams from. */
export type VerifiedStreamTokenPayload = {
  v: 1 | 2;
  uid: string;
  fid: string;
  exp: number;
  jti: string;
};

type VerifyFailReason = "bad_token_format" | "bad_signature" | "expired";

export type TokenVerifyResult =
  | { ok: true; payload: VerifiedStreamTokenPayload }
  | { ok: false; reason: VerifyFailReason };

export type VerifyStreamOptions = { now?: number; skewSeconds?: number };

const HKDF_SALT = "kinetech-video-stream-token-v1";
const HKDF_INFO = "fid-aes-gcm";
const AES_GCM_IV_BYTES = 12;

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
  try {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad === 1) return null;
    if (pad > 1) base64 += "=".repeat(4 - pad);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Key derivation for the encrypted fid: HKDF-SHA256 with a fixed salt/info. */
async function deriveFidKey(secret: string): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HKDF" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: { name: "SHA-256" },
      salt: encoder.encode(HKDF_SALT) as unknown as BufferSource,
      info: encoder.encode(HKDF_INFO) as unknown as BufferSource,
    },
    hkdfKey,
    256,
  );
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Encrypt the Drive file id with AES-GCM (HKDF-derived key, random IV).
 *  `iv` is only used by the deterministic test vector. */
export async function encryptFid(
  fid: string,
  secret: string,
  iv?: Uint8Array,
): Promise<EncryptedFid> {
  const key = await deriveFidKey(secret);
  const ivBytes = iv ?? crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes as unknown as BufferSource },
    key,
    encoder.encode(fid) as unknown as BufferSource,
  );
  return { iv: base64UrlEncode(ivBytes), ct: base64UrlEncode(new Uint8Array(ct)) };
}

/** Decrypt — returns null on any failure (tamper, wrong secret, bad input). */
export async function decryptFid(efid: EncryptedFid, secret: string): Promise<string | null> {
  try {
    if (typeof efid?.iv !== "string" || typeof efid?.ct !== "string") return null;
    const iv = base64UrlDecode(efid.iv);
    const ct = base64UrlDecode(efid.ct);
    if (!iv || !ct) return null;
    const key = await deriveFidKey(secret);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ct as unknown as BufferSource,
    );
    const fid = new TextDecoder().decode(pt);
    return fid !== "" ? fid : null;
  } catch {
    return null;
  }
}

export async function signStreamToken(
  payload: SignedStreamTokenPayload,
  secret: string,
): Promise<string> {
  if (secret === "") throw new Error("stream token: empty secret");
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyStreamToken(
  token: string,
  secret: string,
  options: VerifyStreamOptions = {},
): Promise<TokenVerifyResult> {
  const fail = (reason: VerifyFailReason) => ({ ok: false as const, reason });
  if (secret === "" || typeof token !== "string") return fail("bad_token_format");
  const parts = token.split(".");
  if (parts.length !== 2) return fail("bad_token_format");
  const [body, signature] = parts;
  if (body === "" || signature === "") return fail("bad_token_format");

  const signatureBytes = base64UrlDecode(signature);
  if (!signatureBytes) return fail("bad_token_format");

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as unknown as BufferSource,
    encoder.encode(body),
  );
  if (!ok) return fail("bad_signature");

  const payloadBytes = base64UrlDecode(body);
  if (!payloadBytes) return fail("bad_token_format");

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return fail("bad_token_format");
  }
  if (typeof payload !== "object" || payload === null) return fail("bad_token_format");
  const p = payload as Partial<SignedStreamTokenPayload> & { fid?: string; efid?: EncryptedFid };
  if (p.v !== 1 && p.v !== 2) return fail("bad_token_format");
  if (typeof p.uid !== "string" || p.uid === "") return fail("bad_token_format");
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return fail("bad_token_format");
  if (typeof p.jti !== "string" || p.jti === "") return fail("bad_token_format");

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const skew = options.skewSeconds ?? 0;
  if (p.exp + skew <= now) return fail("expired");

  let fid: string;
  if (p.v === 2) {
    if (typeof p.efid !== "object" || p.efid === null) return fail("bad_token_format");
    const dec = await decryptFid(p.efid, secret);
    if (dec === null) return fail("bad_signature");
    fid = dec;
  } else {
    if (typeof p.fid !== "string" || p.fid === "") return fail("bad_token_format");
    fid = p.fid;
  }

  return { ok: true, payload: { v: p.v, uid: p.uid, fid, exp: p.exp, jti: p.jti } };
}

/** Deterministic vector shared by the web signer, the API copies and the
 *  Worker verifier. Any drift between the copies fails a unit test. */
export const TEST_VECTOR = {
  secret: "stream-test-secret-do-not-use-in-production",
  fid: "1AbCdEfGhIjKlMnOpQrStUvWxYz01234",
  payload: {
    v: 2,
    uid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    efid: {
      iv: "ChQeKDI8RlBaZG54",
      ct: "ZSA9WjoESZBiBsEMa02WDxemxEoi1ynwdkvMbtnUWu8EO1H4zrFfvsD7sBPgjpIl",
    },
    exp: 2000000000,
    jti: "test-jti-0001",
  } satisfies SignedStreamTokenPayload,
  token:
    "eyJ2IjoyLCJ1aWQiOiJhYWFhYWFhYS1iYmJiLWNjY2MtZGRkZC1lZWVlZWVlZWVlZWUiLCJlZmlkIjp7Iml2IjoiQ2hRZUtESThSbEJhWkc1NCIsImN0IjoiWlNBOVdqb0VTWkJpQnNFTWEwMldEeGVteEVvaTF5bndka3ZNYnRuVVd1OEVPMUg0enJGZnZzRDdzQlBnanBJbCJ9LCJleHAiOjIwMDAwMDAwMDAsImp0aSI6InRlc3QtanRpLTAwMDEifQ.FB-GZy_2M5Oe_aqdBSLycAjEbFIKVixQe4YtHyw15fU",
} as const;
