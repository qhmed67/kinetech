// POST /api/account-delete — in-app account deletion (App Store requirement).
//
// Verifies the caller's JWT with the anon client, then deletes the auth user
// with the service-role client. All user-owned tables reference auth.users or
// profiles with ON DELETE CASCADE, so profile, enrollments, progress, video
// views, exam/assignment work, notifications, activity and playback device
// rows go with it. No raw SQL, no user id from the request body.
//
// SELF-CONTAINED ON PURPOSE: no relative imports (see api/play.ts).

import { createClient } from "@supabase/supabase-js";

type ErrorCode = "INVALID_TOKEN" | "CONFIRM_REQUIRED" | "METHOD_NOT_ALLOWED" | "SERVER_ERROR";

const ERRORS: Record<ErrorCode, { status: number; ar: string; en: string }> = {
  INVALID_TOKEN: {
    status: 401,
    ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.",
    en: "Session invalid — please sign in again.",
  },
  CONFIRM_REQUIRED: {
    status: 400,
    ar: "لازم تأكيد الحذف.",
    en: "Deletion confirmation required.",
  },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
  SERVER_ERROR: {
    status: 500,
    ar: "خطأ في الخادم — حاول مجددًا.",
    en: "Server error — please retry.",
  },
};

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => unknown;
};

function readEnv(): { url: string; anonKey: string; serviceKey: string } | null {
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

function fail(res: ApiResponse, code: ErrorCode, detail?: string): unknown {
  const e = ERRORS[code];
  try {
    (globalThis as unknown as { console?: { error: (...a: unknown[]) => void } }).console?.error(
      `[api/account-delete] ${code}${detail ? ` (${detail})` : ""}`,
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

function confirmed(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const value = (body as { confirm?: unknown }).confirm;
  return value === "DELETE";
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "POST") return fail(res, "METHOD_NOT_ALLOWED", "method");
  if (!confirmed(req.body)) return fail(res, "CONFIRM_REQUIRED", "confirm");

  const env = readEnv();
  if (!env) return fail(res, "SERVER_ERROR", "env-missing");
  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  const userClient = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return fail(res, "INVALID_TOKEN", "get-user");

  const admin = createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(authData.user.id);
  if (error) return fail(res, "SERVER_ERROR", "delete-user");

  return res.status(200).json({ ok: true });
}
