// POST /api/session-register — called right after login (SPA + static pages).
// Verifies the JWT, pins this device session as THE active one, and signs
// out every other device session via the admin API. The old device learns
// at its next /api/play (401 SESSION_MISMATCH -> client signs out + message).
//
// SELF-CONTAINED ON PURPOSE: no relative imports of any kind (see api/play.ts).

import { createClient } from "@supabase/supabase-js";

type PlayErrorCode = "INVALID_TOKEN" | "SERVER_ERROR" | "METHOD_NOT_ALLOWED";

const PLAY_ERRORS: Record<PlayErrorCode, { status: number; ar: string; en: string }> = {
  INVALID_TOKEN: { status: 401, ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.", en: "Session invalid — please sign in again." },
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

function readEnv(): { url: string; anonKey: string; serviceKey: string } | null {
  // No process.env here (see api/play.ts): Vercel's pipeline misses node types.
  const g = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  const get = (name: string): string => {
    try {
      const v = g.process?.env?.[name];
      return typeof v === "string" ? v : "";
    } catch {
      return "";
    }
  };
  const url = get("SUPABASE_URL");
  const anonKey = get("SUPABASE_ANON_KEY");
  const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");
  if (url === "" || anonKey === "" || serviceKey === "") return null;
  return { url, anonKey, serviceKey };
}

function fail(res: ApiResponse, code: PlayErrorCode, detail?: string): unknown {
  const e = PLAY_ERRORS[code];
  try {
    (globalThis as unknown as { console?: { error: (...a: unknown[]) => void } }).console?.error(
      `[api/session-register] ${code}${detail ? ` (${detail})` : ""}`,
    );
  } catch {
    /* logging must never break the response */
  }
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

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  const env = readEnv();
  if (!env) return fail(res, "SERVER_ERROR", "env-missing");

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

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
  const ua = headerFirst(req.headers, "user-agent").slice(0, 500);
  const { error: upErr } = await admin.from("active_sessions").upsert(
    { user_id: authData.user.id, session_id: sessionId, user_agent: ua },
    { onConflict: "user_id" },
  );
  if (upErr) return fail(res, "SERVER_ERROR", "sessions-upsert");

  // Other devices out. Best-effort: the registration already succeeded.
  try {
    await admin.auth.admin.signOut(token, "others");
  } catch {
    /* old sessions die at their next play check instead */
  }
  return res.status(200).json({ ok: true });
}
