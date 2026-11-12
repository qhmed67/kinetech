// POST /api/playback/refresh — renew a playback token WITHOUT burning a view.
//
// Why it exists: a playback token is short-lived (2h). When it expires during
// a long session the app needs a fresh one. Re-calling /api/playback/start
// would burn ANOTHER view (the view cap is 3), which would punish the
// student for a technical detail. So the refresh path re-checks the ENTITLEMENT
// (read-only) and re-signs a token — it never counts a view.
//
// It only extends a grant that already exists: the caller must have a view
// row for that lesson (proof that /api/playback/start already granted it).
//
// Request:  { video_id } + Authorization: Bearer <user JWT> + x-kt-device-id
// Success:  { ok: true, grant: { url, expiresAt, email, phoneLast4, minutes,
//                                  viewsLeft, deviceId } }
// Failure:  { ok: false, code, ar, en }
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind (see api/play.ts).

import { createClient } from "@supabase/supabase-js";

// SELF-CONTAINED: no workspace imports (Vercel's function bundler fails to
// load them at runtime: FUNCTION_INVOCATION_FAILED). The signing below
// MIRRORS packages/playback-token/src/index.ts and api/playback/start.ts —
// the shared TEST_VECTOR asserts all three agree (see
// apps/web/src/native/__tests__/api-grant.test.ts).

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

/** Which provider owns the lesson. */
function kindOf(record: { source?: string | null; srcUrl?: string | null }): "r2" | "drive" {
  if (typeof record.source === "string" && record.source !== "") {
    return record.source === "r2" ? "r2" : "drive";
  }
  const marker = (record.srcUrl ?? "").trim().toLowerCase();
  return marker.startsWith("r2:") ? "r2" : "drive";
}

/** The media id inside the R2 bucket (the marker 'r2:<mediaId>' names it). */
function mediaIdOf(record: { src_url?: string | null }, fallback: string): string {
  const marker = (record.src_url ?? "").trim();
  const match = /^r2:(.+)$/i.exec(marker);
  const id = match ? match[1].trim() : "";
  return id !== "" ? id : fallback;
}

type PlaybackErrorCode =
  | "INVALID_TOKEN"
  | "BANNED"
  | "NOT_ENROLLED"
  | "NO_PROFILE"
  | "NOT_FOUND"
  | "VIDEO_MISSING"
  | "NATIVE_UNSUPPORTED_SOURCE"
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
  NATIVE_UNSUPPORTED_SOURCE: { status: 415, ar: "الدرس ده مش متاح في التطبيق بعد. تابعه من الموقع.", en: "This lesson isn't available in the app yet — watch it on the website." },
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

/* Fail loudly at start-up when the playback delivery is not configured. */
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
  logError(`[api/playback-refresh] ${code}${detail ? ` (${detail})` : ""}`);
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en });
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

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
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

  const admin = createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = authData.user.id;

  // Profile: not banned, and the identity for the watermark.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("banned, email, phone, role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return fail(res, "SERVER_ERROR", "profile-read");
  if (!profile) return fail(res, "NO_PROFILE");
  if (profile.banned === true) return fail(res, "BANNED");

  const isAdmin = profile.role === "admin";

  // The lesson and its course.
  const { data: videoRow, error: videoError } = await admin
    .from("videos")
    .select("course_id, mins")
    .eq("id", videoId)
    .maybeSingle();
  if (videoError) return fail(res, "SERVER_ERROR", "video-read");
  if (!videoRow) return fail(res, "NOT_FOUND");

  // Entitlement — read only, no counting.
  if (!isAdmin) {
    const { data: enrolment, error: enrolmentError } = await admin
      .from("enrollments")
      .select("user_id")
      .eq("user_id", userId)
      .eq("course_id", videoRow.course_id)
      .maybeSingle();
    if (enrolmentError) return fail(res, "SERVER_ERROR", "enrolment-read");
    if (!enrolment) return fail(res, "NOT_ENROLLED");
  }

  // A refresh may only EXTEND an existing grant: the student must already
  // have a view row for this lesson (that is what /api/playback/start
  // created). No row = no grant = no token.
  const { data: viewRow, error: viewError } = await admin
    .from("video_views")
    .select("views_count")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (viewError) return fail(res, "SERVER_ERROR", "views-read");
  if (!viewRow) return fail(res, "NO_GRANT");

  // Where the media lives.
  const { data: srcRow, error: srcError } = await admin
    .from("video_sources")
    .select("src_url, source")
    .eq("video_id", videoId)
    .maybeSingle();
  if (srcError) return fail(res, "SERVER_ERROR", "sources-read");
  const record = (srcRow ?? {}) as { src_url?: string; source?: string };
  const kind = kindOf(record);
  if (kind !== "r2") return fail(res, "NATIVE_UNSUPPORTED_SOURCE");

  const url = await workerPlaylistUrl(mediaIdOf(record, videoId), userId, deviceId);
  if (!url) return fail(res, "SERVER_ERROR", "worker-not-configured");

  return res.status(200).json({
    ok: true,
    grant: {
      url,
      expiresAt: new Date((Date.now() + TOKEN_TTL_SECONDS * 1000)).toISOString(),
      email: typeof profile.email === "string" ? profile.email : "",
      phoneLast4:
        typeof profile.phone === "string" && profile.phone.length > 0
          ? profile.phone.slice(-4)
          : "",
      minutes: typeof videoRow.mins === "number" ? videoRow.mins : 0,
      viewsLeft:
        typeof viewRow.views_count === "number"
          ? Math.max(0, 3 - viewRow.views_count)
          : 0,
      deviceId,
    },
  });
}
