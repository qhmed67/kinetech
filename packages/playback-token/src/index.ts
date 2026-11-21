/* Playback token — the short-lived credential that lets the native app pull
 * one lesson's media from the Cloudflare Worker (2027-architecture.md §2.4).
 *
 * The token is HMAC-signed and carries ids only: lesson, user, device and an
 * expiry. It never carries a URL, a storage key or a user-visible secret.
 *
 * IMPORTANT — honest scope: this is a bearer credential for one lesson, not
 * DRM. AES-128 HLS + a signed URL + a device-bound token raise the cost of
 * copying and make leaks traceable; they do NOT make the video impossible
 * to capture. Never describe it as "fully protected".
 *
 * Implementation notes:
 *  - WebCrypto only (globalThis.crypto.subtle): the same code runs in a
 *    Cloudflare Worker, in Node (Vercel functions) and in a browser.
 *  - `subtle.verify` does the signature comparison in constant time.
 */

export const TOKEN_VERSION = 1 as const;

export type PlaybackTokenPayload = {
  /** protocol version */
  v: typeof TOKEN_VERSION;
  /** lesson id (the video row id) */
  lid: string;
  /** user id */
  uid: string;
  /** device id the grant is bound to */
  did: string;
  /** expiry, unix seconds */
  exp: number;
};

export type VerifyOptions = {
  /** when set, the token must have been issued for exactly this lesson */
  lessonId?: string;
  /** clock override (tests) */
  now?: number;
  /** tolerance for clock skew, seconds */
  skewSeconds?: number;
};

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    if (pad === 1) return null;
    if (pad > 1) base64 += "=".repeat(4 - pad);
    const binary = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Minimal structural view of the WebCrypto key.
 *
 *  The DOM lib, the Cloudflare Workers types and @types/node each declare
 *  `CryptoKey` differently (one of them only has the constructor), so this
 *  module never names the type — it stays portable across all three. */
type HmacKey = {
  type: string;
  algorithm: { name: string };
  usages: string[];
  extractable: boolean;
};

async function hmacKey(secret: string): Promise<HmacKey> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return key as unknown as HmacKey;
}

/** Sign a playback token. The payload is embedded, never encrypted. */
export async function signPlaybackToken(
  payload: PlaybackTokenPayload,
  secret: string,
): Promise<string> {
  if (secret === "") throw new Error("playback token: empty secret");
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key as never, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify a playback token.
 * Returns the payload when the signature, version, expiry and (optional)
 * lesson all match — otherwise null. Nothing about the failure is exposed.
 */
export async function verifyPlaybackToken(
  token: string,
  secret: string,
  options: VerifyOptions = {},
): Promise<PlaybackTokenPayload | null> {
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
    key as never,
    signatureBytes,
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
  const p = payload as Partial<PlaybackTokenPayload>;
  if (p.v !== TOKEN_VERSION) return null;
  if (typeof p.lid !== "string" || p.lid === "") return null;
  if (typeof p.uid !== "string" || p.uid === "") return null;
  if (typeof p.did !== "string" || p.did === "") return null;
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return null;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const skew = options.skewSeconds ?? 0;
  if (p.exp + skew <= now) return null;

  if (options.lessonId !== undefined && p.lid !== options.lessonId) return null;

  return {
    v: TOKEN_VERSION,
    lid: p.lid,
    uid: p.uid,
    did: p.did,
    exp: p.exp,
  };
}

/**
 * A fixed vector. Both implementations (the Cloudflare Worker and the Vercel
 * signer) must produce/accept exactly this — it is how we catch drift
 * between the two copies of the signing code.
 */
export const TEST_VECTOR = {
  secret: "test-secret-do-not-use-in-production",
  payload: {
    v: TOKEN_VERSION,
    lid: "11111111-2222-3333-4444-555555555555",
    uid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    did: "99999999-8888-7777-6666-555555555555",
    exp: 2000000000,
  },
  // exp is in the far future so the vector stays valid forever.
  token:
    "eyJ2IjoxLCJsaWQiOiIxMTExMTExMS0yMjIyLTMzMzMtNDQ0NC01NTU1NTU1NTU1NTUiLCJ1aWQiOiJhYWFhYWFhYS1iYmJiLWNjY2MtZGRkZC1lZWVlZWVlZWVlZWUiLCJkaWQiOiI5OTk5OTk5OS04ODg4LTc3NzctNjY2Ni01NTU1NTU1NTU1NTUiLCJleHAiOjIwMDAwMDAwMDB9.MkDDRIQnHM7TbZB0QJLKwNzUBfW3v8xyhGqzmKNB9OE",
} as const;
