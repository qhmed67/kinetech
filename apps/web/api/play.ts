// POST /api/play — the ONLY path to a watchable video URL.
// Request:  { video_id: "<uuid>" }                 + Authorization: Bearer <user JWT>
// Success:  { ok: true, embedUrl, minutes, watermark: { email, phoneLast4 }, viewsLeft }
// Failure:  { ok: false, code, ar, en }            (codes below)
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind. Vercel's
// function bundler has repeatedly choked on cross-file specifiers (notably
// explicit `.ts` extensions), surfacing as a 100% function error rate with
// empty non-JSON responses. The ONLY import is the @supabase/supabase-js
// runtime dependency. Thresholds mirror api/config.ts — change both.
//
// Trust model: the JWT proves WHO (verified via getUser). request_play()
// (SECURITY DEFINER, called with the caller's JWT) gates + counts. The
// service-role client below reads ONLY video_sources (RLS-locked table).
// Raw URLs never leave this function except inside embedUrl.

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";

// Mirrors api/config.ts PLAY — keep in sync (single-file constraint above).
const R1_MAX = 5;
const R1_SECS = 30;
const R2_WARN = 120;
const R2_DENY = 240;
const R2_MINS = 60;
const R3_MAX = 3;
// Duplicate-guard window, SECONDS (server param kept its legacy name
// p_repeat_mins for rolling compatibility — value is seconds).
const REPEAT_SECS = 90;

type PlayErrorCode =
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
  | "BAD_REQUEST"
  | "SERVER_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "SYS_003";

// Mirrors api/config.ts PLAY_ERRORS — keep in sync.
const PLAY_ERRORS: Record<PlayErrorCode, { status: number; ar: string; en: string }> = {
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
  BAD_REQUEST: { status: 400, ar: "طلب غير صالح.", en: "Bad request." },
  SERVER_ERROR: { status: 500, ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry." },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
  SYS_003: { status: 503, ar: "البث المباشر غير متاح — جرّب الفيديو العادي.", en: "Direct Drive is not enabled on this deployment — try the normal Drive player." },
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
  setHeader?: (name: string, value: string) => void;
};

// --- request logging boundary (mirrored: api files must stay self-contained) ---
const ROUTE = "/api/play";
const REQ = new AsyncLocalStorage<string>();
type Level = "info" | "warn" | "error";
type LogError = { code: string; type: string; message: string };
const MIN_LEVEL: Record<Level, number> = { info: 20, warn: 30, error: 40 };

function logEnv(name: string): string {
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    const value = g.process?.env?.[name];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function emit(level: Level, event: string, msg: string, ctx: Record<string, unknown> = {}, error?: LogError): void {
  try {
    const min = logEnv("LOG_LEVEL") as Level;
    if (min in MIN_LEVEL && MIN_LEVEL[level] < MIN_LEVEL[min]) return;
    const id = REQ.getStore();
    const rec: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: "kinetech-api",
      env: logEnv("VERCEL_ENV") || "dev",
      version: logEnv("VERCEL_GIT_COMMIT_SHA") || "dev",
      module: "api.play",
      event,
      msg,
      ...(id ? { correlation_id: id } : {}),
      ctx,
    };
    if (error) rec.error = { ...error, cause: null, stack: null };
    process.stdout.write(`${JSON.stringify(rec)}\n`); // allow-print
  } catch {
    /* logging must never break a response */
  }
}

const WARN_CODE: Record<PlayErrorCode, string> = {
  INVALID_TOKEN: "AUTH_001",
  SESSION_MISMATCH: "AUTH_002",
  BANNED: "AUTH_002",
  NOT_ENROLLED: "AUTH_002",
  VIEW_CAP: "AUTH_002",
  RATE_LIMITED: "AUTH_002",
  SUSPICIOUS_DENY: "AUTH_002",
  NOT_FOUND: "SYS_002",
  VIDEO_MISSING: "SYS_002",
  NO_PROFILE: "AUTH_002",
  BAD_REQUEST: "VAL_001",
  SERVER_ERROR: "SYS_002",
  METHOD_NOT_ALLOWED: "VAL_001",
  SYS_003: "SYS_003",
};

function requestId(headers: ApiRequest["headers"]): string {
  const pick = (name: string): string | string[] | undefined => {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) return value;
    }
    return undefined;
  };
  const raw = pick("x-request-id") ?? pick("x-correlation-id");
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function withLogging(req: ApiRequest, res: ApiResponse, fn: (s: ApiResponse) => Promise<unknown>): Promise<unknown> {
  const id = requestId(req.headers);
  const started = Date.now();
  let status = 200;
  let ended = false;
  res.setHeader?.("x-request-id", id);
  const tracked: ApiResponse = {
    status(code) {
      status = code;
      res.status(code);
      return tracked;
    },
    json(body) {
      if (!ended) {
        ended = true;
        emit("info", "api.request.end", "request finished", {
          route: ROUTE,
          method: req.method ?? "GET",
          status,
          duration_ms: Date.now() - started,
        });
      }
      return res.json(body);
    },
  };
  return REQ.run(id, async () => {
    try {
      return await fn(tracked);
    } catch (error) {
      if (!ended) {
        ended = true;
        emit("error", "api.request.error", "unhandled error", { route: ROUTE, duration_ms: Date.now() - started }, {
          code: "SYS_001",
          type: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message.slice(0, 500) : "unhandled error",
        });
        return res.status(500).json({
          ok: false,
          code: "SYS_001",
          ar: "خطأ في الخادم — حاول مجددًا.",
          en: "Server error — please retry.",
          correlation_id: id,
        });
      }
      return undefined;
    }
  });
}


type Env = { url: string; anonKey: string; serviceKey: string };

// No process/Buffer/@types/node here on purpose: Vercel's function pipeline
// has repeatedly failed to resolve node types, killing every invocation.
// globalThis + string ops typecheck under any lib >= ES2020.
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


function fail(res: ApiResponse, code: PlayErrorCode, detail?: string): unknown {
  const e = PLAY_ERRORS[code];
  emit("warn", "api.request.rejected", e.en, { route: ROUTE, code, detail: detail ?? null }, {
    code: WARN_CODE[code],
    type: "ApiError",
    message: e.en,
  });
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en, correlation_id: REQ.getStore() ?? null });
}

function knownCode(code: string): PlayErrorCode {
  return (code as PlayErrorCode) in PLAY_ERRORS ? (code as PlayErrorCode) : "SERVER_ERROR";
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

// Manual base64url -> binary string (latin-1). No Buffer/atob dependency (see
// above). Only ASCII fields are ever read from the result (session_id is a
// uuid), so multi-byte UTF-8 elsewhere cannot confuse the regex — quotes are
// always single-byte 0x22.
function base64UrlToBinary(input: string): string | null {
  try {
    let s = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad === 1) return null;
    if (pad > 1) s += "=".repeat(4 - pad);
    const val = (ch: string): number => {
      if (ch === "=") return 0;
      const i = B64ABC.indexOf(ch);
      return i;
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

const DRIVE_FILE = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_ID_PARAM = /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/;

function drivePreviewUrl(src: string): string | null {
  const v = (src ?? "").trim();
  if (v === "") return null;
  const id = v.match(DRIVE_FILE)?.[1] ?? v.match(DRIVE_ID_PARAM)?.[1] ?? null;
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

function youtubeId(src: string): string | null {
  const v = (src ?? "").trim();
  if (v === "") return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const m =
    v.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ??
    v.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ??
    v.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ---- Worker stream grant (self-contained copy; mirrors
 * apps/web/src/lib/streamToken.ts and apps/worker-video/src/token.ts).
 *
 * v2: the signed payload carries an AES-GCM-encrypted Drive file id, so the
 * raw id never appears in a token a student can read. The HMAC covers the
 * encrypted payload; the Worker decrypts. Legacy v1 tokens (plaintext fid)
 * still verify. No token, id or URL is ever logged. ---- */
const STREAM_TOKEN_VERSION = 2;
const STREAM_TOKEN_TTL_SECONDS = 60 * 60;

type EncryptedFid = { iv: string; ct: string };

type SignedStreamTokenPayload =
  | { v: 1; uid: string; fid: string; exp: number; jti: string }
  | { v: 2; uid: string; efid: EncryptedFid; exp: number; jti: string };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(secret: string) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Key derivation for the encrypted fid: HKDF-SHA256 with fixed salt/info. */
async function deriveFidKey(secret: string) {
  const encoder = new TextEncoder();
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
      salt: encoder.encode("kinetech-video-stream-token-v1"),
      info: encoder.encode("fid-aes-gcm"),
    },
    hkdfKey,
    256,
  );
  return crypto.subtle.importKey("raw", bits, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
}

/** Encrypt the Drive file id with AES-GCM (HKDF-derived key, random IV). */
async function encryptFid(fid: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await deriveFidKey(secret);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    encoder.encode(fid),
  );
  let binary = "";
  for (const byte of new Uint8Array(ct)) binary += String.fromCharCode(byte);
  const ctB64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { iv: base64UrlEncode(ivBytes), ct: ctB64 };
}

/** Sign { uid, efid, exp, jti } — HMAC-SHA256, base64url. Exported so the
 *  unit tests can assert the shared TEST_VECTOR against this copy. */
export async function signStreamToken(payload: SignedStreamTokenPayload, secret: string): Promise<string> {
  if (secret === "") throw new Error("stream token: empty secret");
  const encoder = new TextEncoder();
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key as never, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function newJti(): string {
  try {
    const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function driveIdFromLink(src: string): string {
  const v = (src ?? "").trim();
  return v.match(DRIVE_FILE)?.[1] ?? v.match(DRIVE_ID_PARAM)?.[1] ?? "";
}

type VideoStreamRow = {
  course_id?: string;
  mins?: number;
  drive_file_id?: string | null;
  youtube_video_id?: string | null;
};

/** Minimal shape of the service-role client used by the helper below (keeps
 *  the self-contained copy independent of the library's generic defaults). */
type AdminDb = { from: (table: string) => any };

/** Read the lesson row, tolerating a database where migration
 *  20261122_video_stream_fallbacks.sql has not been applied yet. */
async function readVideoStreamRow(
  admin: AdminDb,
  videoId: string,
): Promise<VideoStreamRow | null> {
  const full = await admin
    .from("videos")
    .select("course_id,mins,drive_file_id,youtube_video_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!full.error) return (full.data ?? null) as VideoStreamRow | null;
  const basic = await admin
    .from("videos")
    .select("course_id,mins")
    .eq("id", videoId)
    .maybeSingle();
  if (basic.error) return null;
  return (basic.data ?? null) as VideoStreamRow | null;
}

function workerStreamUrl(base: string, token: string): string {
  const origin = base.replace(/\/+$/, "");
  return `${origin}/v?t=${encodeURIComponent(token)}`;
}

/** Raw stored link -> sandboxed embed URL. YouTube keeps its ID-based API
    playable client-side; Drive becomes the preview embed; anything else
    (legacy mp4 seeds) passes through for the native <video> branch. */
export function embedUrlFor(src: string): string | null {
  const v = (src ?? "").trim();
  if (v === "") return null;
  const yt = youtubeId(v);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const preview = drivePreviewUrl(v);
  if (preview) return preview;
  if (/^https:\/\//i.test(v)) return v;
  return null;
}

/** Read-only gate shared by BOTH fallback branches.
 *
 *  A fallback must never consume a view: the initial grant already counted
 *  this playback session. It still enforces everything else — profile, ban,
 *  and enrolment (admins bypass enrolment) — so a fallback can never be used
 *  to reach a lesson the student is not entitled to.
 */
type FallbackGate =
  | { ok: true; videoRow: VideoStreamRow; email: string; phone: string }
  | { ok: false; code: PlayErrorCode; detail?: string };

async function fallbackGate(
  admin: AdminDb,
  userId: string,
  videoId: string,
): Promise<FallbackGate> {
  const videoRow = await readVideoStreamRow(admin, videoId);
  if (!videoRow) return { ok: false, code: "NOT_FOUND" };
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("banned,email,phone,role")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) return { ok: false, code: "SERVER_ERROR", detail: "profile-read" };
  const profile = (prof ?? null) as {
    banned?: boolean;
    email?: string;
    phone?: string;
    role?: string;
  } | null;
  if (!profile) return { ok: false, code: "NO_PROFILE" };
  if (profile.banned === true) return { ok: false, code: "BANNED" };
  if (profile.role !== "admin") {
    const { data: enrolment, error: enrErr } = await admin
      .from("enrollments")
      .select("user_id")
      .eq("user_id", userId)
      .eq("course_id", videoRow.course_id ?? "")
      .maybeSingle();
    if (enrErr) return { ok: false, code: "SERVER_ERROR", detail: "enrolment-read" };
    if (!enrolment) return { ok: false, code: "NOT_ENROLLED" };
  }
  return {
    ok: true,
    videoRow,
    email: typeof profile.email === "string" ? profile.email : "",
    phone: typeof profile.phone === "string" ? profile.phone : "",
  };
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  const env = readEnv();
  if (!env) return fail(res, "SERVER_ERROR", "env-missing");

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { video_id?: unknown; fallback?: unknown };
  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  const fallback =
    body.fallback === "youtube" ? "youtube" : body.fallback === "direct" ? "direct" : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(videoId)) return fail(res, "BAD_REQUEST", "video-id");

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
  const ua = headerFirst(req.headers, "user-agent").slice(0, 500);

  // Single-session gate. No row yet = pre-deploy legacy session: adopt it
  // (valid JWT proves ownership) instead of locking the user out.
  const { data: sess, error: sessError } = await admin
    .from("active_sessions")
    .select("session_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (sessError) return fail(res, "SERVER_ERROR", "sessions-read");
  const row = sess as { session_id: string } | null;
  if (!row) {
    const { error: upErr } = await admin
      .from("active_sessions")
      .upsert(
        { user_id: authData.user.id, session_id: sessionId, user_agent: ua },
        { onConflict: "user_id" },
      );
    if (upErr) return fail(res, "SERVER_ERROR", "sessions-adopt");
  } else if (String(row.session_id).toLowerCase() !== sessionId) {
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

  // ---- YouTube fallback: a separate, READ-ONLY call -----------------------
  // The client asks for this only after the Worker and Drive tiers failed.
  // It never counts a view (the initial grant already did) and never weakens
  // the gate: same JWT, same single-session check above, plus a read-only
  // entitlement + ban check. The id is returned only here, never in the
  // initial response, HTML or a bundle.
  if (fallback === "youtube") {
    const g = await fallbackGate(admin, authData.user.id, videoId);
    if (!g.ok) return fail(res, g.code, g.detail);
    const { data: fbSrcRow } = await admin
      .from("video_sources")
      .select("src_url")
      .eq("video_id", videoId)
      .maybeSingle();
    const fbRaw = ((fbSrcRow as { src_url?: string } | null)?.src_url ?? "").trim();
    const yt = ((g.videoRow.youtube_video_id ?? "").trim() || youtubeId(fbRaw) || "");
    if (yt === "") return fail(res, "VIDEO_MISSING", "no-youtube");
    return res.status(200).json({
      ok: true,
      mode: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
      youtubeVideoId: yt,
      minutes: typeof g.videoRow.mins === "number" ? g.videoRow.mins : 0,
      watermark: {
        email: g.email,
        phoneLast4: g.phone.length > 0 ? g.phone.slice(-4) : "",
      },
      viewsLeft: 0,
    });
  }

  // ---- Direct Drive fallback: also READ-ONLY ------------------------------
  // This used to sit AFTER request_play, so every Worker failure burned
  // another view: one lesson click could consume the whole cap and then be
  // rejected by the very check that was supposed to protect it. It now runs
  // before the view-counting RPC, with the same read-only gate as YouTube.
  if (fallback === "direct") {
    const g = await fallbackGate(admin, authData.user.id, videoId);
    if (!g.ok) return fail(res, g.code, g.detail);
    const { data: dsSrcRow } = await admin
      .from("video_sources")
      .select("src_url")
      .eq("video_id", videoId)
      .maybeSingle();
    const dsRaw = ((dsSrcRow as { src_url?: string } | null)?.src_url ?? "").trim();
    const driveId = ((g.videoRow.drive_file_id ?? "").trim() || driveIdFromLink(dsRaw));
    if (driveId === "") return fail(res, "VIDEO_MISSING", "no-drive-id");
    const key = getEnvVar("DRIVE_BROWSER_KEY");
    if (key === "") return fail(res, "SYS_003");
    return res.status(200).json({
      ok: true,
      mode: "direct",
      driveFileId: driveId,
      key,
      // Same-grant fallback: the client switches tiers without another call.
      embedUrl: embedUrlFor(dsRaw) ?? undefined,
      youtubeAvailable: ((g.videoRow.youtube_video_id ?? "").trim() || youtubeId(dsRaw) || "") !== "",
      minutes: typeof g.videoRow.mins === "number" ? g.videoRow.mins : 0,
      watermark: {
        email: g.email,
        phoneLast4: g.phone.length > 0 ? g.phone.slice(-4) : "",
      },
      viewsLeft: 0,
    });
  }

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
    views_count: number;
    consumed: boolean;
  } | null;
  if (!play || !play.ok) return fail(res, knownCode(play?.code ?? ""), `gate-${play?.code ?? "empty"}`);

  const { data: srcRow, error: srcError } = await admin
    .from("video_sources")
    .select("src_url")
    .eq("video_id", videoId)
    .maybeSingle();
  if (srcError) return fail(res, "SERVER_ERROR", "sources-read");
  const raw = ((srcRow as { src_url?: string } | null)?.src_url ?? "").trim();
  if (raw === "") return fail(res, "VIDEO_MISSING");
  const embed = embedUrlFor(raw);
  if (!embed) return fail(res, "VIDEO_MISSING");

  // The explicit columns win; until the additive migration is applied the
  // Drive id is derived from the stored link, so existing lessons keep
  // working and can use the Worker path immediately.
  // Read the row best-effort: a transient read failure must not block
  // playback — the Drive embed path works without the stream columns.
  let videoRow: VideoStreamRow | null = null;
  try {
    videoRow = await readVideoStreamRow(admin, videoId);
  } catch {
    videoRow = null;
  }
  const driveFileId =
    ((videoRow?.drive_file_id ?? "").trim() || driveIdFromLink(raw));
  const youtubeVideoId =
    ((videoRow?.youtube_video_id ?? "").trim() || (youtubeId(raw) ?? ""));
  const workerBase = getEnvVar("VIDEO_STREAM_WORKER_URL").replace(/\/+$/, "");
  const streamSecret = getEnvVar("STREAM_TOKEN_SECRET");

  // Retention: opportunistic 90-day purge (pg_cron may not exist on free tiers).
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    await admin.from("watch_events").delete().lt("created_at", cutoff);
  } catch {
    /* next request retries */
  }

  // Worker-stream branch. FAIL-SAFE: missing or malformed env
  // (STREAM_TOKEN_SECRET / VIDEO_STREAM_WORKER_URL), a signing error or any
  // other failure degrades to the existing Drive embed response — the
  // branch itself never throws.
  let workerSrc: string | null = null;
  let workerExp = 0;
  try {
    if (driveFileId !== "" && workerBase !== "" && streamSecret !== "") {
      const base = new URL(workerBase); // malformed value throws → caught
      if (base.protocol !== "https:" && base.protocol !== "http:") {
        throw new TypeError("worker url is not http(s)");
      }
      const now = Math.floor(Date.now() / 1000);
      const exp = now + STREAM_TOKEN_TTL_SECONDS;
      const token = await signStreamToken(
        {
          v: STREAM_TOKEN_VERSION,
          uid: authData.user.id,
          efid: await encryptFid(driveFileId, streamSecret),
          exp,
          jti: newJti(),
        },
        streamSecret,
      );
      workerSrc = workerStreamUrl(base.href, token);
      workerExp = exp;
    } else {
      // Not configured — say WHICH side is missing. Previously this fell through
      // silently and every caller saw only mode:"embed", which made a missing or
      // malformed env var indistinguishable from a signing failure.
      emit("info", "api.play.worker_skipped", "worker tier not configured", {
        route: ROUTE,
        hasDriveFileId: driveFileId !== "",
        hasWorkerUrl: workerBase !== "",
        hasSecret: streamSecret !== "",
      });
    }
  } catch (e) {
    workerSrc = null;
    // Non-secret diagnosis only: the error class name plus presence booleans.
    // A bare `catch {}` here hid a malformed VIDEO_STREAM_WORKER_URL (new URL()
    // throws) behind the same mode:"embed" a missing var produces.
    emit("warn", "api.play.worker_failed", "worker tier could not be signed", {
      route: ROUTE,
      reason: (e as { name?: string })?.name ?? "error",
      hasWorkerUrl: workerBase !== "",
      hasSecret: streamSecret !== "",
    });
  }

  if (workerSrc !== null) {
    return res.status(200).json({
      ok: true,
      mode: "worker",
      // No Drive id in the URL: the Worker reads it from the signed token.
      src: workerSrc,
      // Same-grant Drive fallback: the client can switch tiers WITHOUT a
      // second /api/play (which would burn another view).
      embedUrl: embed,
      expiresAt: new Date(workerExp * 1000).toISOString(),
      youtubeAvailable: youtubeVideoId !== "",
      minutes: play.minutes,
      watermark: { email: play.email, phoneLast4: play.phone_last4 },
      viewsLeft: play.views_left,
    });
  }

  return res.status(200).json({
    ok: true,
    mode: "embed",
    embedUrl: embed,
    youtubeAvailable: youtubeVideoId !== "",
    minutes: play.minutes,
    watermark: { email: play.email, phoneLast4: play.phone_last4 },
    viewsLeft: play.views_left,
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  return withLogging(req, res, (s) => handle(req, s));
}
