// POST /api/playback/start — the ONLY path to a NATIVE playback URL.
// Request:  { video_id: "<uuid>" } + Authorization: Bearer <user JWT>
//           + x-kt-device-id: <uuid>   (the device the grant is bound to)
// Success:  { ok: true, grant: { url, expiresAt, email, phoneLast4, minutes,
//                                  viewsLeft, deviceId } }
// Failure:  { ok: false, code, ar, en }
//
// The grant goes to the native shell ONLY — never to the WebView, never to a
// log line, never to a student-facing string.
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind, and no imports
// from our workspace packages either (see api/play.ts — Vercel's function
// bundler fails to load a workspace package at runtime: FUNCTION_INVOCATION_FAILED).
// The gate is the SAME one the web uses (request_play RPC + the single-session
// check), so a student without an enrolment is refused here too.
//
// Media sources: an R2 lesson is served by the Cloudflare Worker behind a
// short-lived, device-bound token (signed right here). A Drive/YouTube link
// is a web embed that a native player cannot play, so it is refused with
// NATIVE_UNSUPPORTED_SOURCE and keeps playing in the browser.
//
// The token signing below MIRRORS packages/playback-token/src/index.ts — keep
// the two in sync. The shared TEST_VECTOR (packages/playback-token) is asserted
// by apps/web/src/native/__tests__/api-grant.test.ts, so a drift between the
// two copies fails the build.

import { createClient } from "@supabase/supabase-js";

// Mirrors api/play.ts — keep in sync.
const R1_MAX = 5;
const R1_SECS = 30;
const R2_WARN = 120;
const R2_DENY = 240;
const R2_MINS = 60;
const R3_MAX = 3;
const REPEAT_SECS = 90;

/** Playback tokens live this long. */
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

const TOKEN_VERSION = 1;

type GrantPayload = {
  v: number;
  lid: string;
  uid: string;
  did: string;
  exp: number;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign a playback token (HMAC-SHA256 over the base64url payload). */
export async function signPlaybackGrant(
  payload: GrantPayload,
  secret: string,
): Promise<string> {
  if (secret === "") throw new Error("playback token: empty secret");
  const encoder = new TextEncoder();
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key as never, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** The Worker playlist URL for a lesson, with the token attached.
 *  Mirrors R2Source in packages/video-source (keep in sync — the drift guard
 *  in apps/web/src/native/__tests__/api-grant.test.ts compares the two). */
export function r2PlaylistUrl(workerUrl: string, lessonId: string, token: string): string {
  const base = workerUrl.replace(/\/+$/, "");
  return `${base}/v/${encodeURIComponent(lessonId)}/index.m3u8?t=${encodeURIComponent(token)}`;
}

/** The Worker playlist URL for a lesson, with a fresh token. */
async function workerPlaylistUrl(
  lessonId: string,
  userId: string,
  deviceId: string,
): Promise<string | null> {
  const secret = getEnvVar("GRANT_SECRET");
  const workerUrl = getEnvVar("VIDEO_WORKER_BASE_URL").replace(/\/+$/, "");
  if (secret === "" || workerUrl === "") return null;
  const now = Math.floor(Date.now() / 1000);
  const token = await signPlaybackGrant(
    { v: TOKEN_VERSION, lid: lessonId, uid: userId, did: deviceId, exp: now + TOKEN_TTL_SECONDS },
    secret,
  );
  return r2PlaylistUrl(workerUrl, lessonId, token);
}

/** Which provider owns the lesson. The `source` column wins; before the
 *  migration is applied the stored marker decides (r2:... vs a Drive link). */
function kindOf(record: { source?: string | null; srcUrl?: string | null }): "r2" | "drive" {
  if (typeof record.source === "string" && record.source !== "") {
    return record.source === "r2" ? "r2" : "drive";
  }
  const marker = (record.srcUrl ?? "").trim().toLowerCase();
  return marker.startsWith("r2:") ? "r2" : "drive";
}

/** The media id inside the R2 bucket. The marker 'r2:<mediaId>' names it
 *  (the video row id is a uuid, the media path may be any id — e.g. a test
 *  lesson uploaded as 'test-001'). The token and the URL both use it. */
function mediaIdOf(record: { src_url?: string | null }, fallback: string): string {
  const marker = (record.src_url ?? "").trim();
  const match = /^r2:(.+)$/i.exec(marker);
  const id = match ? match[1].trim() : "";
  return id !== "" ? id : fallback;
}

type PlaybackErrorCode =
  | "INVALID_TOKEN"
  | "SESSION_MISMATCH"
  | "BANNED"
  | "NOT_ENROLLED"
  | "VIEW_CAP"
  | "RATE_LIMITED"
  | "SUSPICIOUS_DENY"
  | "NOT_FOUND"
  | "VIDEO_MISSING"
  | "NO_PROFILE"
  | "NATIVE_UNSUPPORTED_SOURCE"
  | "SERVER_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "BAD_REQUEST";

const PLAYBACK_ERRORS: Record<PlaybackErrorCode, { status: number; ar: string; en: string }> = {
  INVALID_TOKEN: { status: 401, ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.", en: "Session invalid — please sign in again." },
  SESSION_MISMATCH: { status: 401, ar: "تم تسجيل الدخول من جهاز آخر. تم تسجيل خروج هذا الجهاز.", en: "Signed in on another device. This device has been signed out." },
  BANNED: { status: 403, ar: "تم إيقاف هذا الحساب. تواصل مع الدعم.", en: "This account is suspended. Contact support." },
  NOT_ENROLLED: { status: 403, ar: "غير مسجل في هذا الكورس.", en: "Not enrolled in this course." },
  VIEW_CAP: { status: 403, ar: "وصلت للحد الأقصى للمشاهدات (3).", en: "Viewing limit reached (3 views)." },
  RATE_LIMITED: { status: 429, ar: "طلبات كثيرة جدًا — انتظر قليلًا وحاول مجددًا.", en: "Too many requests — wait a moment and retry." },
  SUSPICIOUS_DENY: { status: 403, ar: "تم رفض التشغيل لنشاط غير معتاد. تواصل مع الدعم.", en: "Playback denied for unusual activity. Contact support." },
  NOT_FOUND: { status: 404, ar: "الفيديو غير موجود.", en: "Video not found." },
  VIDEO_MISSING: { status: 404, ar: "ملف الفيديو غير مرفق بعد.", en: "Video file not attached yet." },
  NO_PROFILE: { status: 403, ar: "الحساب غير مكتمل. تواصل مع الدعم.", en: "Account incomplete. Contact support." },
  NATIVE_UNSUPPORTED_SOURCE: { status: 415, ar: "الدرس ده مش متاح في التطبيق بعد. تابعه من الموقع.", en: "This lesson isn't available in the app yet — watch it on the website." },
  SERVER_ERROR: { status: 500, ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry." },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
  BAD_REQUEST: { status: 400, ar: "طلب غير صالح.", en: "Bad request." },
};

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => unknown;
};

type Env = { url: string; anonKey: string; serviceKey: string };

function getEnvVar(name: string): string {
  try {
    const g = globalThis as unknown as {
      process?: { env?: Record<string, string | undefined> };
    };
    const v = g.process?.env?.[name];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function readEnv(): Env | null {
  const url = getEnvVar("SUPABASE_URL");
  const anonKey = getEnvVar("SUPABASE_ANON_KEY");
  const serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  if (url === "" || anonKey === "" || serviceKey === "") return null;
  return { url, anonKey, serviceKey };
}

/* Fail loudly at start-up when the playback delivery is not configured: a
 * missing secret or base URL must not look like "the student has no access". */
function assertVideoConfig(): void {
  const missing: string[] = [];
  if (getEnvVar("GRANT_SECRET") === "") missing.push("GRANT_SECRET");
  if (getEnvVar("VIDEO_WORKER_BASE_URL") === "") missing.push("VIDEO_WORKER_BASE_URL");
  if (missing.length > 0) {
    logError(
      `[api/playback] FATAL: missing server env ${missing.join(", ")} — ` +
        "R2 playback is disabled until they are set (see .env.example)",
    );
  }
}
assertVideoConfig();

function logError(tag: string): void {
  try {
    (globalThis as unknown as { console?: { error: (...a: unknown[]) => void } }).console?.error(tag);
  } catch {
    /* logging must never break the response */
  }
}

function fail(res: ApiResponse, code: PlaybackErrorCode, detail?: string): unknown {
  const e = PLAYBACK_ERRORS[code];
  // Never log a URL, a token or a device id.
  logError(`[api/playback-start] ${code}${detail ? ` (${detail})` : ""}`);
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en });
}

function knownCode(code: string): PlaybackErrorCode {
  return (code as PlaybackErrorCode) in PLAYBACK_ERRORS ? (code as PlaybackErrorCode) : "SERVER_ERROR";
}

function bearer(headers: ApiRequest["headers"]): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const m = v.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  return token !== "" ? token : null;
}

function headerFirst(headers: ApiRequest["headers"], name: string): string {
  const raw = headers[name.toLowerCase()] ?? headers[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v : "";
}

const B64ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64UrlToBinary(input: string): string | null {
  try {
    let s = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad === 1) return null;
    if (pad > 1) s += "=".repeat(4 - pad);
    const val = (ch: string): number => {
      if (ch === "=") return 0;
      return B64ABC.indexOf(ch);
    };
    let out = "";
    for (let i = 0; i < s.length; i += 4) {
      const a = val(s.charAt(i));
      const b = val(s.charAt(i + 1));
      const c = val(s.charAt(i + 2));
      const d = val(s.charAt(i + 3));
      if (a < 0 || b < 0 || c < 0 || d < 0) return null;
      const n = (a << 18) | (b << 12) | (c << 6) | d;
      out += String.fromCharCode((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    if (s.endsWith("==")) out = out.slice(0, -2);
    else if (s.endsWith("=")) out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

function jwtSessionId(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const bin = base64UrlToBinary(parts[1]);
  if (!bin) return null;
  const m = bin.match(/"session_id"\s*:\s*"([^"]+)"/);
  const sid = m ? m[1].trim().toLowerCase() : "";
  return sid !== "" ? sid : null;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

type PlayResult = {
  email: string;
  phone_last4: string;
  minutes: number;
  views_left: number;
};

/** Playback session audit (device bound). Best-effort: never blocks the grant. */
async function auditPlayback(
  admin: { from: (table: string) => { insert: (row: Record<string, unknown>) => unknown } },
  userId: string,
  videoId: string,
  ip: string,
  ua: string,
): Promise<void> {
  try {
    await admin.from("watch_events").insert({
      user_id: userId,
      video_id: videoId,
      ip,
      user_agent: ua,
      denied: false,
      reason: "native-playback",
    });
  } catch {
    /* audit best-effort */
  }
}

/** When the playback token stops working. */
function tokenExpiry(): string {
  return new Date((Date.now() + TOKEN_TTL_SECONDS * 1000)).toISOString();
}

/** The grant the native app receives: a short-lived media URL plus the
 *  watermark identity. The URL never reaches the WebView or a log line. */
function grantResponse(
  res: ApiResponse,
  url: string,
  expiresAt: string,
  play: PlayResult,
  deviceId: string,
): unknown {
  return res.status(200).json({
    ok: true,
    grant: {
      url,
      expiresAt,
      email: play.email,
      phoneLast4: play.phone_last4,
      minutes: play.minutes,
      viewsLeft: play.views_left,
      deviceId,
    },
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  const env = readEnv();
  if (!env) return fail(res, "SERVER_ERROR", "env-missing");

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  const deviceId = headerFirst(req.headers, "x-kt-device-id").trim().toLowerCase();
  if (!UUID_RE.test(deviceId)) return fail(res, "BAD_REQUEST", "device-id");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { video_id?: unknown };
  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!UUID_RE.test(videoId)) return fail(res, "BAD_REQUEST", "video-id");

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return fail(res, "INVALID_TOKEN", "get-user");

  const sessionId = jwtSessionId(token);
  if (!sessionId) return fail(res, "SERVER_ERROR", "no-session-claim");

  const admin = createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = headerFirst(req.headers, "x-forwarded-for").split(",")[0].trim();
  // The device id rides along in the audit row (no schema change needed).
  const ua = `${headerFirst(req.headers, "user-agent").slice(0, 400)} kt-device`.slice(0, 500);

  // Single-session gate — same rule as api/play.ts.
  const { data: sess, error: sessError } = await admin
    .from("active_sessions")
    .select("session_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (sessError) return fail(res, "SERVER_ERROR", "sessions-read");
  const row = sess as { session_id: string } | null;
  if (row && String(row.session_id).toLowerCase() !== sessionId) {
    try {
      await admin.from("watch_events").insert({
        user_id: authData.user.id,
        video_id: videoId,
        ip,
        user_agent: ua,
        denied: true,
        reason: "session-mismatch",
      });
    } catch {
      /* audit best-effort */
    }
    return fail(res, "SESSION_MISMATCH");
  }

  // The gate: entitlement, view cap, rate limits, watermark identity.
  const { data: playRows, error: rpcError } = await userClient.rpc("request_play", {
    p_video: videoId,
    p_session: sessionId,
    p_ip: ip,
    p_ua: ua,
    p_r1_max: R1_MAX,
    p_r1_secs: R1_SECS,
    p_r2_warn: R2_WARN,
    p_r2_deny: R2_DENY,
    p_r2_mins: R2_MINS,
    p_r3_max: R3_MAX,
    p_repeat_mins: REPEAT_SECS,
  });
  if (rpcError) return fail(res, "SERVER_ERROR", "request-play");
  const play = (Array.isArray(playRows) ? playRows[0] : playRows) as {
    ok: boolean;
    code: string;
    flagged: boolean;
    minutes: number;
    email: string;
    phone_last4: string;
    views_left: number;
  } | null;
  if (!play || !play.ok) return fail(res, knownCode(play?.code ?? ""), `gate-${play?.code ?? "empty"}`);

  // The real media location (service role only). The `source` column tells
  // us which provider owns the lesson; before the migration is applied the
  // stored marker decides (r2:... vs a Drive link).
  const { data: srcRow, error: srcError } = await admin
    .from("video_sources")
    .select("src_url, source")
    .eq("video_id", videoId)
    .maybeSingle();
  if (srcError) {
    // The `source` column may not exist yet (migration not applied) — fall
    // back to the old shape and infer the provider from the marker.
    const { data: legacyRow, error: legacyError } = await admin
      .from("video_sources")
      .select("src_url")
      .eq("video_id", videoId)
      .maybeSingle();
    if (legacyError) return fail(res, "SERVER_ERROR", "sources-read");
    const legacySrc = ((legacyRow as { src_url?: string } | null)?.src_url ?? "").trim();
    if (legacySrc === "") return fail(res, "VIDEO_MISSING");
    if (kindOf({ srcUrl: legacySrc }) === "r2") {
      const url = await workerPlaylistUrl(videoId, authData.user.id, deviceId);
      if (!url) return fail(res, "SERVER_ERROR", "worker-not-configured");
      await auditPlayback(admin, authData.user.id, videoId, ip, ua);
      return grantResponse(res, url, tokenExpiry(), play, deviceId);
    }
    return fail(res, "NATIVE_UNSUPPORTED_SOURCE");
  }

  const record = (srcRow ?? {}) as { src_url?: string; source?: string };
  const raw = (record.src_url ?? "").trim();
  if (raw === "") return fail(res, "VIDEO_MISSING");

  const kind = kindOf(record);

  if (kind === "r2") {
    // The media id comes from the 'r2:<mediaId>' marker (the R2 path is
    // keyed by it; the video row id stays the uuid the DB uses).
    const url = await workerPlaylistUrl(
      mediaIdOf(record, videoId),
      authData.user.id,
      deviceId,
    );
    if (!url) return fail(res, "SERVER_ERROR", "worker-not-configured");
    await auditPlayback(admin, authData.user.id, videoId, ip, ua);
    return grantResponse(res, url, tokenExpiry(), play, deviceId);
  }

  // Drive (or any other web embed): a native player cannot play it.
  return fail(res, "NATIVE_UNSUPPORTED_SOURCE");
}
