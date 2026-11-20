// POST /api/log — accepts a batch of client warn/error log lines.
// Body: { logs: [ { ts, level, service, env, version, module, event, msg,
//                   correlation_id?, duration_ms?, ctx?, error? }, ... ] }
// Success: { ok: true, accepted } — fails never break the app (client uses
// navigator.sendBeacon and ignores the response).
//
// SELF-CONTAINED ON PURPOSE: no relative imports (see api/play.ts).
// Allow-list only: extra fields are dropped, secret-like keys are removed,
// URLs in strings are masked. No auth token is required or stored.

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";

type Code = "OK" | "BAD_REQUEST" | "METHOD_NOT_ALLOWED" | "RATE_LIMITED" | "CONFIG_MISSING" | "DB_ERROR" | "SERVER_ERROR";

const ERR: Record<Exclude<Code, "OK">, { status: number; ar: string; en: string }> = {
  BAD_REQUEST: { status: 400, ar: "سجل غير صالح.", en: "Invalid log batch." },
  METHOD_NOT_ALLOWED: { status: 405, ar: "طريقة غير مسموحة.", en: "Method not allowed." },
  RATE_LIMITED: { status: 429, ar: "طلبات سجل كثيرة جدًا.", en: "Too many log requests." },
  CONFIG_MISSING: { status: 500, ar: "تخزين السجلات غير مهيأ.", en: "Log storage not configured." },
  DB_ERROR: { status: 500, ar: "تعذر حفظ السجلات.", en: "Could not store logs." },
  SERVER_ERROR: { status: 500, ar: "خطأ في الخادم — حاول مجددًا.", en: "Server error — please retry." },
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
const ROUTE = "/api/log";
const REQ = new AsyncLocalStorage<string>();
type Level = "info" | "warn" | "error";
type LogError = { code: string; type: string; message: string };
const MIN_LEVEL: Record<Level, number> = { info: 20, warn: 30, error: 40 };

function getEnvVar(name: string): string {
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    const v = g.process?.env?.[name];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function emit(level: Level, event: string, msg: string, ctx: Record<string, unknown> = {}, error?: LogError): void {
  try {
    const min = getEnvVar("LOG_LEVEL") as Level;
    if (min in MIN_LEVEL && MIN_LEVEL[level] < MIN_LEVEL[min]) return;
    const id = REQ.getStore();
    const rec: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: "kinetech-api",
      env: getEnvVar("VERCEL_ENV") || "dev",
      version: getEnvVar("VERCEL_GIT_COMMIT_SHA") || "dev",
      module: "api.log",
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

const WARN_CODE: Record<Exclude<Code, "OK">, string> = {
  BAD_REQUEST: "VAL_001",
  METHOD_NOT_ALLOWED: "VAL_001",
  RATE_LIMITED: "LOG_001",
  CONFIG_MISSING: "SYS_002",
  DB_ERROR: "DB_001",
  SERVER_ERROR: "SYS_001",
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
          method: req.method ?? "POST",
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
          ar: ERR.SERVER_ERROR.ar,
          en: ERR.SERVER_ERROR.en,
          correlation_id: id,
        });
      }
      return undefined;
    }
  });
}

function fail(res: ApiResponse, code: Exclude<Code, "OK">, detail?: string): unknown {
  const e = ERR[code];
  emit("warn", "api.request.rejected", e.en, { route: ROUTE, code, detail: detail ?? null }, {
    code: WARN_CODE[code],
    type: "ApiError",
    message: e.en,
  });
  return res.status(e.status).json({ ok: false, code, ar: e.ar, en: e.en, correlation_id: REQ.getStore() ?? null });
}

// --- batch validation / redaction -----------------------------------------
const MAX_LINES = 20;
const MAX_BYTES = 64_000;
const MAX_STR = 500;
const WINDOW_MS = 60_000;
const MAX_BATCHES = 12;
const LEVELS = new Set(["warn", "error", "fatal"]);
const SECRET = /(password|token|authorization|cookie|secret|api[-_]?key|email|phone|grant|embedurl|srcurl|playlist|url)/i;
const LIMITS = new Map<string, { count: number; reset: number }>();

function scrub(text: string): string {
  return text
    .replace(/\b(bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .slice(0, MAX_STR);
}

function clean(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET.test(key)) continue;
      out[key.slice(0, 64)] = clean(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return scrub(value);
  if (typeof value === "function" || typeof value === "symbol") return "[UNSERIALIZABLE]";
  return value;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? scrub(value) : null;
}

function acceptLine(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const line = value as Record<string, unknown>;
  const level = line.level;
  if (typeof level !== "string" || !LEVELS.has(level)) return null;
  const required = ["ts", "service", "env", "version", "module", "event", "msg"];
  for (const key of required) {
    if (text(line[key]) === null) return null;
  }
  if (!Number.isFinite(Date.parse(String(line.ts)))) return null;
  if (!["kinetech-web", "kinetech-api"].includes(String(line.service))) return null;
  if (!["dev", "development", "preview", "production"].includes(String(line.env))) return null;
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,5}$/.test(String(line.event))) return null;
  const id = text(line.correlation_id);
  const error = line.error && typeof line.error === "object" && !Array.isArray(line.error)
    ? clean(line.error) as Record<string, unknown>
    : null;
  return {
    ts: text(line.ts),
    level,
    service: text(line.service),
    env: text(line.env),
    version: text(line.version),
    module: text(line.module),
    event: text(line.event),
    msg: text(line.msg),
    correlation_id: id && /^[A-Za-z0-9._:-]{1,128}$/.test(id) ? id : null,
    duration_ms: typeof line.duration_ms === "number" && Number.isFinite(line.duration_ms)
      ? Math.max(0, Math.min(600_000, Math.round(line.duration_ms)))
      : null,
    error: error && typeof error.code === "string" ? error : null,
    ctx: line.ctx && typeof line.ctx === "object" && !Array.isArray(line.ctx) ? clean(line.ctx) : null,
  };
}

function clientIp(headers: ApiRequest["headers"]): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = typeof raw === "string" ? raw.split(",")[0].trim() : "";
  return ip.slice(0, 64) || "unknown";
}

function limited(headers: ApiRequest["headers"]): boolean {
  const key = clientIp(headers);
  const now = Date.now();
  const state = LIMITS.get(key);
  if (!state || now >= state.reset) {
    LIMITS.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  state.count += 1;
  return state.count > MAX_BATCHES;
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if ((req.method ?? "POST").toUpperCase() !== "POST") return fail(res, "METHOD_NOT_ALLOWED");
  if (limited(req.headers)) return fail(res, "RATE_LIMITED", "batch window");

  const raw = req.body as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.logs) || raw.logs.length === 0) {
    return fail(res, "BAD_REQUEST", "logs array");
  }
  if (raw.logs.length > MAX_LINES) return fail(res, "BAD_REQUEST", "batch size");
  try {
    if (JSON.stringify(raw).length > MAX_BYTES) return fail(res, "BAD_REQUEST", "payload size");
  } catch {
    return fail(res, "BAD_REQUEST", "payload size");
  }

  const rows = raw.logs.map(acceptLine).filter((row): row is Record<string, unknown> => row !== null);
  if (rows.length === 0) return fail(res, "BAD_REQUEST", "no valid lines");

  const url = getEnvVar("SUPABASE_URL");
  const key = getEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return fail(res, "CONFIG_MISSING", "supabase env");

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await sb.from("app_logs").insert(rows);
  if (error) {
    emit("error", "log.store.failed", "could not persist client logs", {
      route: ROUTE,
      accepted: 0,
    }, {
      code: "DB_001",
      type: error.name ?? "PostgrestError",
      message: String(error.message ?? "insert failed"),
    });
    return fail(res, "DB_ERROR", "insert failed");
  }
  emit("info", "log.store.ok", "client logs persisted", { route: ROUTE, accepted: rows.length });
  return res.status(200).json({ ok: true, accepted: rows.length, correlation_id: REQ.getStore() ?? null });
}

export default function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  return withLogging(req, res, (s) => handle(req, s));
}
