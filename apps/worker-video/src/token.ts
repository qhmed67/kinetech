/* Stream token verifier — the Worker's copy.
 *
 * Payload: { v, uid, fid, exp, jti }. HMAC-SHA256 over the base64url body,
 * WebCrypto only, constant-time comparison via crypto.subtle.verify.
 *
 * This file is the Worker's copy of apps/web/src/lib/streamToken.ts. The
 * shared TEST_VECTOR (asserted in tests/token.test.ts) keeps the copies in
 * sync. The Drive file id lives inside the signed payload, never in a URL.
 */

export const STREAM_TOKEN_VERSION = 1 as const;

export type StreamTokenPayload = {
  v: typeof STREAM_TOKEN_VERSION;
  uid: string;
  fid: string;
  exp: number;
  jti: string;
};

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

export async function signStreamToken(
  payload: StreamTokenPayload,
  secret: string,
): Promise<string> {
  if (secret === "") throw new Error("stream token: empty secret");
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export type VerifyStreamOptions = { now?: number; skewSeconds?: number };

export async function verifyStreamToken(
  token: string,
  secret: string,
  options: VerifyStreamOptions = {},
): Promise<StreamTokenPayload | null> {
  if (secret === "" || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (body === "" || signature === "") return null;

  const signatureBytes = base64UrlDecode(signature);
  if (!signatureBytes) return null;

  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as unknown as BufferSource,
    encoder.encode(body),
  );
  if (!ok) return null;

  const payloadBytes = base64UrlDecode(body);
  if (!payloadBytes) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Partial<StreamTokenPayload>;
  if (p.v !== STREAM_TOKEN_VERSION) return null;
  if (typeof p.uid !== "string" || p.uid === "") return null;
  if (typeof p.fid !== "string" || p.fid === "") return null;
  if (typeof p.jti !== "string" || p.jti === "") return null;
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return null;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const skew = options.skewSeconds ?? 0;
  if (p.exp + skew <= now) return null;

  return { v: STREAM_TOKEN_VERSION, uid: p.uid, fid: p.fid, exp: p.exp, jti: p.jti };
}

export const TEST_VECTOR = {
  secret: "stream-test-secret-do-not-use-in-production",
  payload: {
    v: STREAM_TOKEN_VERSION,
    uid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    fid: "1AbCdEfGhIjKlMnOpQrStUvWxYz01234",
    exp: 2000000000,
    jti: "test-jti-0001",
  },
  token:
    "eyJ2IjoxLCJ1aWQiOiJhYWFhYWFhYS1iYmJiLWNjY2MtZGRkZC1lZWVlZWVlZWVlZWUiLCJmaWQiOiIxQWJDZEVmR2hJaktsTW5PcFFyU3RVdld4WXowMTIzNCIsImV4cCI6MjAwMDAwMDAwMCwianRpIjoidGVzdC1qdGktMDAwMSJ9.tmb5evNo2De5NfoyNFhKpf-UqwCaQoHlr2SyKR5xh9w",
} as const;
