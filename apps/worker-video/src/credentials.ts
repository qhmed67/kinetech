/* Drive credential pool.
 *
 * DRIVE_CREDENTIALS is a JSON array of entries:
 *   [{ "type": "apikey", "key": "AIza..." },
 *    { "type": "service_account", "json": { ...service account json... } }]
 *
 * Selection is round-robin. Only the first entry is enabled today; the
 * architecture accepts a list so a second key can be added without a deploy
 * of new code. On a Drive 403/429 the caller tries the next entry once.
 *
 * Parsing is fail-soft and never throws: any unparseable or unusable value
 * yields an empty pool (the Worker answers quota, and the player falls back
 * to the Drive tier). A non-secret `credentials_shape` warning is logged
 * once per parsed value: bare_key | quoted | array | object | invalid.
 *
 * API-key mode reads files shared as "Anyone with the link". Service-account
 * mode is optional (private files): the folder must be shared with the SA's
 * client_email. Access tokens are cached in module scope until shortly before
 * expiry.
 */

import { logWorker } from "./log";

export type ServiceAccountJson = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type DriveCredential =
  | { type: "apikey"; key: string }
  | { type: "service_account"; json: string | ServiceAccountJson };

export type DriveAuth =
  | { kind: "key"; key: string }
  | { kind: "bearer"; token: string };

/** Non-secret diagnostic of how the DRIVE_CREDENTIALS value was shaped. */
export type CredentialsShape = "array" | "object" | "bare_key" | "quoted" | "invalid";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function isServiceAccount(value: unknown): value is ServiceAccountJson {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.client_email === "string" && typeof v.private_key === "string";
}

/** Strip one layer of surrounding quotes ("..." or '...'). */
function stripOneLayerQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1).trim();
    }
  }
  return v;
}

/** Extract enabled entries from a JSON array or single object. Invalid
 *  entries are dropped (never thrown) so one bad entry cannot take the
 *  Worker down. */
function extractEntries(parsed: unknown): DriveCredential[] {
  const entries: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const out: DriveCredential[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (e.type === "apikey" && typeof e.key === "string" && e.key.trim() !== "") {
      out.push({ type: "apikey", key: e.key.trim() });
    } else if (e.type === "service_account") {
      if (typeof e.json === "string") {
        try {
          const obj = JSON.parse(e.json) as unknown;
          if (isServiceAccount(obj)) out.push({ type: "service_account", json: obj });
        } catch {
          /* skip invalid */
        }
      } else if (isServiceAccount(e.json)) {
        out.push({ type: "service_account", json: e.json });
      }
    }
  }
  return out;
}

export type CredentialsParseResult = {
  credentials: DriveCredential[];
  shape: CredentialsShape;
};

/** Parse the env value: fail-soft, never throws. See the module doc for the
 *  accepted shapes. */
export function parseCredentialsDetailed(raw: string | undefined | null): CredentialsParseResult {
  const trimmed = (raw ?? "").trim();
  const v = stripOneLayerQuotes(trimmed);
  const hadQuotes = v !== trimmed;
  const keyShape: CredentialsShape = hadQuotes ? "quoted" : "bare_key";
  if (v === "") {
    logWorker("credentials_shape", { shape: "invalid" });
    return { credentials: [], shape: "invalid" };
  }
  let parsed: unknown;
  let parsedOk = false;
  try {
    parsed = JSON.parse(v);
    parsedOk = true;
  } catch {
    parsedOk = false;
  }
  if (!parsedOk) {
    if (v.startsWith("AIza")) {
      // A Google API key string (quoted or bare, no JSON).
      logWorker("credentials_shape", { shape: keyShape });
      return { credentials: [{ type: "apikey", key: v }], shape: keyShape };
    }
    logWorker("credentials_shape", { shape: "invalid" });
    return { credentials: [], shape: "invalid" };
  }
  if (Array.isArray(parsed)) {
    logWorker("credentials_shape", { shape: "array" });
    return { credentials: extractEntries(parsed), shape: "array" };
  }
  if (isServiceAccount(parsed)) {
    logWorker("credentials_shape", { shape: "object" });
    return { credentials: [{ type: "service_account", json: parsed }], shape: "object" };
  }
  const asObj = parsed as Record<string, unknown>;
  if (asObj.type === "apikey" && typeof asObj.key === "string" && asObj.key.trim() !== "") {
    logWorker("credentials_shape", { shape: "object" });
    return { credentials: [{ type: "apikey", key: asObj.key.trim() }], shape: "object" };
  }
  if (asObj.type === "service_account") {
    // Single service-account object (no surrounding array).
    logWorker("credentials_shape", { shape: "object" });
    return { credentials: extractEntries([parsed]), shape: "object" };
  }
  if (typeof parsed === "string" && parsed.startsWith("AIza")) {
    // JSON-encoded key string (the value was quoted, so JSON.parse yields it).
    logWorker("credentials_shape", { shape: keyShape });
    return { credentials: [{ type: "apikey", key: parsed }], shape: keyShape };
  }
  logWorker("credentials_shape", { shape: "object" });
  return { credentials: extractEntries(parsed), shape: "object" };
}

/** Parse the env value. Invalid entries are dropped (never thrown) so one bad
 *  entry cannot take the Worker down. */
export function parseCredentials(raw: string | undefined | null): DriveCredential[] {
  return parseCredentialsDetailed(raw).credentials;
}

/** Round-robin pick. `start` is a monotonic counter supplied by the caller. */
export function pickCredential(
  pool: DriveCredential[],
  start: number,
): DriveCredential | null {
  if (pool.length === 0) return null;
  const index = ((start % pool.length) + pool.length) % pool.length;
  return pool[index];
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

type CachedToken = { token: string; exp: number };
const tokenCache = new Map<string, CachedToken>();

async function serviceAccountToken(
  sa: ServiceAccountJson,
  fetchImpl: typeof fetch,
  now: number,
): Promise<string | null> {
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.exp > now + 30) return cached.token;

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri ?? DEFAULT_TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };
  const encoder = new TextEncoder();
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(
    encoder.encode(JSON.stringify(claim)),
  )}`;
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToDer(sa.private_key) as unknown as BufferSource,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      encoder.encode(signingInput),
    );
    const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
    const res = await fetchImpl(sa.token_uri ?? DEFAULT_TOKEN_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (typeof json.access_token !== "string" || json.access_token === "") return null;
    const ttl = typeof json.expires_in === "number" ? json.expires_in : 3600;
    tokenCache.set(sa.client_email, { token: json.access_token, exp: now + ttl });
    return json.access_token;
  } catch {
    return null;
  }
}

/** Resolve a credential into request auth. Returns null when unusable. */
export async function authFor(
  credential: DriveCredential,
  fetchImpl: typeof fetch = fetch,
  now: number = Math.floor(Date.now() / 1000),
): Promise<DriveAuth | null> {
  if (credential.type === "apikey") {
    return credential.key !== "" ? { kind: "key", key: credential.key } : null;
  }
  let sa: ServiceAccountJson;
  try {
    sa = typeof credential.json === "string"
      ? (JSON.parse(credential.json) as ServiceAccountJson)
      : credential.json;
  } catch {
    return null;
  }
  const token = await serviceAccountToken(sa, fetchImpl, now);
  return token ? { kind: "bearer", token } : null;
}

/** Test hook: clears the module-scope token cache. */
export function clearTokenCache(): void {
  tokenCache.clear();
}
