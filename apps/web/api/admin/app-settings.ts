// GET/POST/PUT /api/admin/app-settings — admin-only runtime settings.
// GET  ?key=video_worker_enabled  -> { ok, key, value, updated_at, updated_by }
// POST { key, value }              -> { ok, key, value, old_value, updated_at, updated_by }
// Authorization: Bearer <admin JWT>
//
// SELF-CONTAINED ON PURPOSE: no relative imports (see api/play.ts).
// Admin role is verified server-side from profiles.role; client-sent role is ignored.
// Every write inserts an audit row (who/when/old->new) in app_settings_audit.

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";

const ROUTE = "/api/admin/app-settings";
const ALLOWED_KEYS = new Set(["video_worker_enabled"]);

type Code = "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "SERVER_ERROR" | "METHOD_NOT_ALLOWED" | "INVALID_TOKEN";
const ERR: Record<Code, { status: number; ar: string; en: string }> = {
  BAD_REQUEST: { status: 400, ar: "طلب غير صالح.", en: "Bad request." },
  FORBIDDEN: { status: 403, ar: "للأدمن فقط.", en: "Admins only." },
  NOT_FOUND: { status: 404, ar: "الإعداد غير موجود.", en: "Setting not found." },
  SERVER_ERROR: { status: 500, ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry." },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
  INVALID_TOKEN: { status: 401, ar: "انتهت الجلسة — سجّل الدخول مرة أخرى.", en: "Session invalid — please sign in again." },
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
      module: "api.admin.app-settings",
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

const WARN_CODE: Record<Code, string> = {
  BAD_REQUEST: "VAL_001",
  FORBIDDEN: "AUTH_002",
  NOT_FOUND: "SYS_002",
  SERVER_ERROR: "SYS_002",
  METHOD_NOT_ALLOWED: "VAL_001",
  INVALID_TOKEN: "AUTH_001",
};

function getEnvVar(name: string): string {
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    const v = g.process?.env?.[name];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function fail(res: ApiResponse, code: Code, detail?: string): unknown {
  const e = ERR[code];
  emit("warn", "api.request.rejected", e.en, { route: ROUTE, code, detail: detail ?? null }, {
    code: WARN_CODE[code], type: "ApiError", message: e.en,
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

function safeJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

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
    status(code) { status = code; res.status(code); return tracked; },
    json(body) {
      if (!ended) {
        ended = true;
        emit("info", "api.request.end", "request finished", {
          route: ROUTE, method: req.method ?? "GET", status, duration_ms: Date.now() - started,
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
          code: "SYS_001", type: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message.slice(0, 500) : "unhandled error",
        });
        return res.status(500).json({ ok: false, code: "SYS_001", ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry.", correlation_id: id });
      }
      return undefined;
    }
  });
}

function parseWorkerEnabledValue(value: unknown): { enabled: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const e = (value as { enabled?: unknown }).enabled;
  if (typeof e !== "boolean") return null;
  return { enabled: e };
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT") return fail(res, "METHOD_NOT_ALLOWED", "method");

  const url = getEnvVar("SUPABASE_URL");
  const anonKey = getEnvVar("SUPABASE_ANON_KEY");
  const serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  if (url === "" || anonKey === "" || serviceKey === "") return fail(res, "SERVER_ERROR", "env-missing");

  const token = bearer(req.headers);
  if (!token) return fail(res, "INVALID_TOKEN", "no-bearer");

  // Verify JWT with anon client (proves identity).
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return fail(res, "INVALID_TOKEN", "get-user");

  // Admin role check server-side via service-role (never trust client-sent role).
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profErr) return fail(res, "SERVER_ERROR", "profile-read");
  if ((prof as { role?: string } | null)?.role !== "admin") return fail(res, "FORBIDDEN", "role");

  const rawBody = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const body = (rawBody ?? {}) as { key?: unknown; value?: unknown };
  const queryKey = typeof req.query?.key === "string" ? req.query.key : Array.isArray(req.query?.key) ? req.query?.key[0] : "";
  const key = (req.method === "GET" ? String(queryKey || "") : String(body.key ?? "")).trim();
  if (!ALLOWED_KEYS.has(key)) return fail(res, "BAD_REQUEST", "key");

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("app_settings")
      .select("key,value,updated_at,updated_by")
      .eq("key", key)
      .maybeSingle();
    if (error) return fail(res, "SERVER_ERROR", "settings-read");
    if (!data) {
      // Missing row => fail-safe default (Worker enabled). Report explicitly.
      return res.status(200).json({
        ok: true, key, value: { enabled: true }, updated_at: null, updated_by: null, updated_by_name: null, missing: true,
      });
    }
    const row = data as { key: string; value: unknown; updated_at: string | null; updated_by: string | null };
    let updatedByName: string | null = null;
    if (row.updated_by) {
      const { data: p } = await admin.from("profiles").select("name,email").eq("id", row.updated_by).maybeSingle();
      const prof = p as { name?: string | null; email?: string | null } | null;
      updatedByName = (prof?.name || prof?.email || null) as string | null;
    }
    return res.status(200).json({
      ok: true, key: row.key, value: row.value, updated_at: row.updated_at, updated_by: row.updated_by, updated_by_name: updatedByName, missing: false,
    });
  }

  // POST/PUT: write setting. Validate value shape per key.
  if (key === "video_worker_enabled") {
    const parsed = parseWorkerEnabledValue(body.value);
    if (!parsed) return fail(res, "BAD_REQUEST", "value-shape");
    const { data: oldRow, error: readErr } = await admin
      .from("app_settings")
      .select("value,updated_at,updated_by")
      .eq("key", key)
      .maybeSingle();
    if (readErr) return fail(res, "SERVER_ERROR", "settings-read-before-write");

    const oldValue = (oldRow as { value?: unknown } | null)?.value ?? null;
    const nowIso = new Date().toISOString();
    const { data: upserted, error: writeErr } = await admin
      .from("app_settings")
      .upsert(
        { key, value: parsed, updated_at: nowIso, updated_by: authData.user.id },
        { onConflict: "key" },
      )
      .select("key,value,updated_at,updated_by")
      .single();
    if (writeErr) return fail(res, "SERVER_ERROR", "settings-write");

    // Audit row (who/when/old->new). Best-effort but important; log failure.
    const { error: auditErr } = await admin.from("app_settings_audit").insert({
      key,
      old_value: oldValue,
      new_value: parsed,
      changed_by: authData.user.id,
      changed_at: nowIso,
      source: "admin-api",
    });
    if (auditErr) {
      emit("warn", "api.admin.settings_audit_failed", "settings audit insert failed", {
        route: ROUTE, key,
      }, { code: "SYS_002", type: "DbError", message: "app_settings_audit insert failed" });
    }

    emit("info", "api.admin.settings_updated", "setting updated", {
      route: ROUTE, key, enabled: parsed.enabled,
    });

    const row = upserted as { key: string; value: unknown; updated_at: string; updated_by: string | null };
    let updatedByName: string | null = null;
    const { data: p } = await admin.from("profiles").select("name,email").eq("id", authData.user.id).maybeSingle();
    const prof = p as { name?: string | null; email?: string | null } | null;
    updatedByName = (prof?.name || prof?.email || null) as string | null;
    return res.status(200).json({
      ok: true,
      key: row.key,
      value: row.value,
      old_value: oldValue,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      updated_by_name: updatedByName,
    });
  }

  return fail(res, "BAD_REQUEST", "unsupported-key");
}

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  return withLogging(req, res, (s) => handle(req, s));
}
