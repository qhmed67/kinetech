// POST /api/playback/stream-refresh — renew a Worker stream token WITHOUT
// burning a view.
//
// Why it exists: a Worker stream grant lives 60 minutes. A long lesson needs
// a fresh token so the client can swap `src` without restarting playback.
// Re-calling /api/play would burn ANOTHER view (the cap is 3), punishing the
// student for a technical detail. This path re-checks the ENTITLEMENT
// (read-only) and re-signs a token — it never counts a view.
//
// It only extends a grant that already exists: the caller must have a view
// row for that lesson (proof that /api/play already granted it).
//
// Request:  { video_id } + Authorization: Bearer <user JWT>
// Success:  { ok: true, src, expiresAt, minutes }
// Failure:  { ok: false, code, ar, en }
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind (see api/play.ts).
// The signing below MIRRORS apps/web/src/lib/streamToken.ts and
// apps/worker-video/src/token.ts — the shared TEST_VECTOR asserts all copies.

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";

const STREAM_TOKEN_VERSION = 2;
const STREAM_TOKEN_TTL_SECONDS = 60 * 60;

const DRIVE_FILE = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_ID_PARAM = /drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/;

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
  return { iv: base64UrlEncode(ivBytes), ct: btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
}

/** Exported so tests can assert the shared vector against this copy. */
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

type PlaybackErrorCode =
  | "INVALID_TOKEN"
  | "BANNED"
  | "NOT_ENROLLED"
  | "NO_PROFILE"
  | "NOT_FOUND"
  | "VIDEO_MISSING"
  | "NO_GRANT"
  | "SERVER_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "BAD_REQUEST";

const PLAYBACK_ERRORS: Record<PlaybackErrorCode, { status: number; ar: string; en: string }> = {
  INVALID_TOKEN: { status: 401, ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.", en: "Session invalid — please sign in again." },
  BANNED: { status: 403, ar: "تم إيقاف هذا الحساب. تواصل مع الدعم.", en: "This account is suspended. Contact support." },
  NOT_ENROLLED: { status: 403, ar: "غير مسجل في هذا الكورس.", en: "Not enrolled in this course." },
  NO_PROFILE: { status: 403, ar: "الحساب غير مكتمل. تواصل مع الدعم.", en: "Account incomplete. Contact support." },
  NOT_FOUND: { status: 404, ar: "الفيديو غير موجود.", en: "Video not found." },
  VIDEO_MISSING: { status: 404, ar: "ملف الفيديو غير مرفق بعد.", en: "Video file not attached yet." },
  NO_GRANT: { status: 403, ar: "ابدأ الدرس من جديد.", en: "Start the lesson again." },
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
  setHeader?: (name: string, value: string) => void;
};

// --- request logging boundary (mirrored: api files must stay self-contained) ---
const ROUTE = "/api/playback/stream-refresh";
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
      module: "api.playback.stream-refresh",
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

const WARN_CODE: Record<PlaybackErrorCode, string> = {
  INVALID_TOKEN: "AUTH_001",
  BANNED: "AUTH_002",
  NOT_ENROLLED: "AUTH_002",
  NO_PROFILE: "AUTH_002",
  NOT_FOUND: "SYS_002",
  VIDEO_MISSING: "SYS_002",
  NO_GRANT: "AUTH_002",
  SERVER_ERROR: "SYS_002",
  METHOD_NOT_ALLOWED: "VAL_001",
  BAD_REQUEST: "VAL_001",
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

function fail(res: ApiResponse, code: PlaybackErrorCode, detail?: string): unknown {
  const e = PLAYBACK_ERRORS[code];
  emit("warn", "api.request.rejected", e.en, { route: ROUTE, code, detail: detail ?? null }, {
    code: WARN_CODE[code],
    type: "ApiError",
    message: e.en,
  });
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en, correlation_id: REQ.getStore() ?? null });
}

function bearer(headers: ApiRequest["headers"]): string | null {
  const raw = headers.authorization ?? headers.Authorization;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const m = v.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : "";
  return token !== "" ? token : null;
}

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

type VideoRow = {
  course_id?: string;
  mins?: number;
  drive_file_id?: string | null;
  youtube_video_id?: string | null;
};

type AdminDb = { from: (table: string) => any };

async function readVideoRow(
  admin: AdminDb,
  videoId: string,
): Promise<VideoRow | null> {
  const full = await admin
    .from("videos")
    .select("course_id,mins,drive_file_id,youtube_video_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!full.error) return (full.data ?? null) as VideoRow | null;
  const basic = await admin
    .from("videos")
    .select("course_id,mins")
    .eq("id", videoId)
    .maybeSingle();
  if (basic.error) return null;
  return (basic.data ?? null) as VideoRow | null;
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  const url = getEnvVar("SUPABASE_URL");
  const anonKey = getEnvVar("SUPABASE_ANON_KEY");
  const serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  const workerBase = getEnvVar("VIDEO_STREAM_WORKER_URL").replace(/\/+$/, "");
  const streamSecret = getEnvVar("STREAM_TOKEN_SECRET");
  if (url === "" || anonKey === "" || serviceKey === "") {
    return fail(res, "SERVER_ERROR", "env-missing");
  }
  if (workerBase === "" || streamSecret === "") {
    return fail(res, "SERVER_ERROR", "stream-env-missing");
  }

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { video_id?: unknown };
  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!UUID_RE.test(videoId)) return fail(res, "BAD_REQUEST", "video-id");

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return fail(res, "INVALID_TOKEN", "get-user");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = authData.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("banned,email,phone,role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return fail(res, "SERVER_ERROR", "profile-read");
  if (!profile) return fail(res, "NO_PROFILE");
  if (profile.banned === true) return fail(res, "BANNED");

  const videoRow = await readVideoRow(admin, videoId);
  if (!videoRow) return fail(res, "NOT_FOUND");

  if (profile.role !== "admin") {
    const { data: enrolment, error: enrolmentError } = await admin
      .from("enrollments")
      .select("user_id")
      .eq("user_id", userId)
      .eq("course_id", videoRow.course_id ?? "")
      .maybeSingle();
    if (enrolmentError) return fail(res, "SERVER_ERROR", "enrolment-read");
    if (!enrolment) return fail(res, "NOT_ENROLLED");
  }

  // A refresh may only EXTEND an existing grant: /api/play created the view
  // row. No row = no grant = no token (and no view is counted here).
  const { data: viewRow, error: viewError } = await admin
    .from("video_views")
    .select("views_count")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (viewError) return fail(res, "SERVER_ERROR", "views-read");
  if (!viewRow) return fail(res, "NO_GRANT");

  const { data: srcRow, error: srcError } = await admin
    .from("video_sources")
    .select("src_url")
    .eq("video_id", videoId)
    .maybeSingle();
  if (srcError) return fail(res, "SERVER_ERROR", "sources-read");
  const raw = ((srcRow as { src_url?: string } | null)?.src_url ?? "").trim();
  const driveFileId = ((videoRow.drive_file_id ?? "").trim() || driveIdFromLink(raw));
  if (driveFileId === "") return fail(res, "VIDEO_MISSING", "no-drive-id");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + STREAM_TOKEN_TTL_SECONDS;
  const streamToken = await signStreamToken(
    { v: STREAM_TOKEN_VERSION, uid: userId, efid: await encryptFid(driveFileId, streamSecret), exp, jti: newJti() },
    streamSecret,
  );

  return res.status(200).json({
    ok: true,
    src: `${workerBase}/v?t=${encodeURIComponent(streamToken)}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    minutes: typeof videoRow.mins === "number" ? videoRow.mins : 0,
  });
}

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  return withLogging(req, res, (s) => handle(req, s));
}
