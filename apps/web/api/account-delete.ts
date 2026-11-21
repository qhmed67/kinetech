// POST /api/account-delete — in-app account deletion (App Store requirement).
//
// Verifies the caller's JWT with the anon client, then deletes the auth user
// with the service-role client. All user-owned tables reference auth.users or
// profiles with ON DELETE CASCADE, so profile, enrollments, progress, video
// views, exam/assignment work, notifications, activity and playback device
// rows go with it. No raw SQL, no user id from the request body.
//
// SELF-CONTAINED ON PURPOSE: no relative imports (see api/play.ts).

import { AsyncLocalStorage } from "node:async_hooks";
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
  setHeader?: (name: string, value: string) => void;
};

// --- request logging boundary (mirrored: api files must stay self-contained) ---
const ROUTE = "/api/account-delete";
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
      module: "api.account-delete",
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

const WARN_CODE: Record<ErrorCode, string> = {
  INVALID_TOKEN: "AUTH_001",
  CONFIRM_REQUIRED: "VAL_001",
  METHOD_NOT_ALLOWED: "VAL_001",
  SERVER_ERROR: "SYS_002",
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

function confirmed(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const value = (body as { confirm?: unknown }).confirm;
  return value === "DELETE";
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<unknown> {
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

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  return withLogging(req, res, (s) => handle(req, s));
}
