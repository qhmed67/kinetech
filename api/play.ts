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

import { createClient } from "@supabase/supabase-js";

// Mirrors api/config.ts PLAY — keep in sync (single-file constraint above).
const R1_MAX = 5;
const R1_SECS = 30;
const R2_WARN = 120;
const R2_DENY = 240;
const R2_MINS = 60;
const R3_MAX = 3;
const REPEAT_MINS = 30;

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
  | "METHOD_NOT_ALLOWED";

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

function logError(tag: string): void {
  // globalThis-cast, never bare console: api files must typecheck with NO
  // node types at all (see getEnvVar).
  try {
    (globalThis as unknown as { console?: { error: (...a: unknown[]) => void } }).console?.error(tag);
  } catch {
    /* logging must never break the response */
  }
}

function fail(res: ApiResponse, code: PlayErrorCode, detail?: string): unknown {
  const e = PLAY_ERRORS[code];
  logError(`[api/play] ${code}${detail ? ` (${detail})` : ""}`);
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en });
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

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  const env = readEnv();
  if (!env) return fail(res, "SERVER_ERROR", "env-missing");

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { video_id?: unknown };
  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
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
    p_repeat_mins: REPEAT_MINS,
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

  // Retention: opportunistic 90-day purge (pg_cron may not exist on free tiers).
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    await admin.from("watch_events").delete().lt("created_at", cutoff);
  } catch {
    /* next request retries */
  }

  return res.status(200).json({
    ok: true,
    embedUrl: embed,
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
