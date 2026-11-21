// Server logger — step 13.6.1 (no behavior change: nothing imports it yet).
//
// Emits the EXACT JSONL schema in docs/LOGGING.md (snake_case fields,
// correlation_id, registered error codes) so scripts/logs.sh can read it.
// Section 13.2 of AGENTS.md uses older camelCase field names; this module
// follows the repo standard that already has a validator and code registry.
//
// FILENAME starts with `_` so Vercel does NOT deploy this as a function
// (vercel.com/docs/functions/configuring-functions/advanced-configuration).
//
// SELF-CONTAINED: no relative imports. Vercel's function bundler rejects
// imported modules inside api/*.ts (see AGENTS.md Section 8), so a handler
// that wants this logger must carry its own mirrored copy until that
// constraint is revisited. Step 13.6.2 decides how to apply it.
//
// Never throws, never logs secrets/PII/video locations. Zero dependencies.

import { AsyncLocalStorage } from "node:async_hooks";

export type Level = "debug" | "info" | "warn" | "error" | "fatal";
export type LogHeaders = Record<string, string | string[] | undefined>;
type Sink = (line: string) => void;

const ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const SECRET =
  /(password|passphrase|token|authorization|cookie|secret|api[-_]?key|database[-_]?url|connectionstring|phone|email|national[-_]?id|card|grant|embedurl|srcurl|playlist|key|url)/i;
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

const als = new AsyncLocalStorage<{ correlation_id: string }>();

function env(name: string): string {
  try {
    const value = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

const cfg = {
  service: "kinetech-api",
  env: env("APP_ENV") || env("VERCEL_ENV") || "dev",
  version: env("VERCEL_GIT_COMMIT_SHA") || "dev",
  min: (env("LOG_LEVEL") as Level) || "info",
  sink: ((line: string) => {
    try {
      process.stdout.write(line); // allow-print
    } catch {
      /* logging must never break the app */
    }
  }) as Sink,
};

export function configure(options: Partial<typeof cfg>): void {
  if (options.service !== undefined) cfg.service = options.service;
  if (options.env !== undefined) cfg.env = options.env;
  if (options.version !== undefined) cfg.version = options.version;
  if (options.min !== undefined && options.min in ORDER) cfg.min = options.min;
  if (options.sink !== undefined) cfg.sink = options.sink;
}

export function withCorrelation<T>(id: string, fn: () => T): T {
  return als.run({ correlation_id: id }, fn);
}

export function currentCorrelationId(): string | undefined {
  return als.getStore()?.correlation_id;
}

export function newRequestId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `req_${uuid}`;
  } catch {
    /* fall through */
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Accepts the repo header (x-request-id) and the older X-Correlation-ID. */
export function requestIdFromHeaders(headers: LogHeaders): string {
  const pick = (name: string): string | string[] | undefined => {
    const direct = headers[name] ?? headers[name.toLowerCase()];
    if (direct !== undefined) return direct;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) return value;
    }
    return undefined;
  };
  const raw = pick("x-request-id") ?? pick("x-correlation-id");
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && ID_RE.test(value) ? value : newRequestId();
}

function scrubText(text: string): string {
  return text
    .replace(/\b(bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/([?&]?(?:t|token|key|sig|signature|secret)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 2000);
}

function redact(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, seen, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: scrubText(value.message) };
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET.test(key) ? "[REDACTED]" : redact(item, seen, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return scrubText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return "[UNSERIALIZABLE]";
  return value;
}

function errorRecord(error: unknown, code: string | undefined, fallback: string) {
  const e = error instanceof Error ? error : undefined;
  return {
    code: code && /^[A-Z]{2,6}_[0-9]{3}$/.test(code) ? code : "SYS_001",
    type: e?.name ?? (error === undefined ? null : typeof error),
    message: scrubText(e?.message ?? (typeof error === "string" ? error : fallback)),
    cause: e && "cause" in e && e.cause !== undefined ? scrubText(String(e.cause)) : null,
    stack: e?.stack ? scrubText(e.stack) : null,
  };
}

export function log(
  level: Level,
  event: string,
  msg: string,
  options: {
    module: string;
    ctx?: Record<string, unknown>;
    error?: unknown;
    code?: string;
    correlationId?: string;
  },
): void {
  if (!(level in ORDER) || ORDER[level] < ORDER[cfg.min]) return;
  try {
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: cfg.service,
      env: cfg.env,
      version: cfg.version,
      module: options.module,
      event,
      msg: scrubText(msg),
    };
    const id = options.correlationId ?? currentCorrelationId();
    if (id) record.correlation_id = id;
    if (options.error !== undefined || level === "error" || level === "fatal") {
      record.error = errorRecord(options.error, options.code, msg);
    }
    if (options.ctx) record.ctx = redact(options.ctx, new WeakSet<object>(), 0);
    cfg.sink(`${JSON.stringify(record)}\n`);
  } catch {
    /* logging must never break the app */
  }
}
