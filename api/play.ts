// POST /api/play — the ONLY path to a watchable video URL.
// Request:  { video_id: "<uuid>" }                 + Authorization: Bearer <user JWT>
// Success:  { ok: true, embedUrl, minutes, watermark: { email, phoneLast4 }, viewsLeft }
// Failure:  { ok: false, code, ar, en }            (codes in ./config.ts)
//
// Trust model: the JWT proves WHO (verified via getUser). request_play()
// (SECURITY DEFINER, called with the caller's JWT) gates + counts. The
// service-role client below reads ONLY video_sources (RLS-locked table).
// Raw URLs never leave this function except inside embedUrl.

import { createClient } from "@supabase/supabase-js";
import { PLAY, PLAY_ERRORS, type PlayErrorCode } from "./config.ts";
import { toDrivePreviewUrl } from "../src/lib/drive.ts";

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

function readEnv(): Env | null {
  const url = process.env.SUPABASE_URL ?? "";
  const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url === "" || anonKey === "" || serviceKey === "") return null;
  return { url, anonKey, serviceKey };
}

function fail(res: ApiResponse, code: PlayErrorCode): unknown {
  const e = PLAY_ERRORS[code];
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

function jwtSessionId(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { session_id?: unknown };
    const sid = typeof payload.session_id === "string" ? payload.session_id.trim().toLowerCase() : "";
    return sid !== "" ? sid : null;
  } catch {
    return null;
  }
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
  const preview = toDrivePreviewUrl(v);
  if (preview) return preview;
  if (/^https:\/\//i.test(v)) return v;
  return null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED");
  const env = readEnv();
  if (!env) return fail(res, "SERVER_ERROR");

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { video_id?: unknown };
  const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(videoId)) return fail(res, "BAD_REQUEST");

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return fail(res, "INVALID_TOKEN");

  const sessionId = jwtSessionId(token);
  if (!sessionId) return fail(res, "SERVER_ERROR");

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
  if (sessError) return fail(res, "SERVER_ERROR");
  const row = sess as { session_id: string } | null;
  if (!row) {
    const { error: upErr } = await admin
      .from("active_sessions")
      .upsert(
        { user_id: authData.user.id, session_id: sessionId, user_agent: ua },
        { onConflict: "user_id" },
      );
    if (upErr) return fail(res, "SERVER_ERROR");
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
    p_r1_max: PLAY.r1Max,
    p_r1_secs: PLAY.r1Secs,
    p_r2_warn: PLAY.r2Warn,
    p_r2_deny: PLAY.r2Deny,
    p_r2_mins: PLAY.r2Mins,
    p_r3_max: PLAY.r3Max,
    p_repeat_mins: PLAY.repeatMins,
  });
  if (rpcError) return fail(res, "SERVER_ERROR");
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
  if (!play || !play.ok) return fail(res, knownCode(play?.code ?? ""));

  const { data: srcRow, error: srcError } = await admin
    .from("video_sources")
    .select("src_url")
    .eq("video_id", videoId)
    .maybeSingle();
  if (srcError) return fail(res, "SERVER_ERROR");
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
