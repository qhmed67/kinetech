// Client logger — emits the docs/LOGGING.md JSONL schema.
// stdout is the local sink; warn/error lines are also batched to POST /api/log
// with navigator.sendBeacon. Never throws, never logs row data.

export type Level = "debug" | "info" | "warn" | "error" | "fatal";
export type LogError = { code: string; type: string; message: string };

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const SECRET = /(password|token|authorization|cookie|secret|api[-_]?key|email|phone|grant|embedurl|srcurl|playlist|url)/i;

let currentId: string | undefined;

export function newCorrelationId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `req_${uuid}`;
  } catch {
    /* fall through */
  }
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getCorrelationId(): string | undefined {
  return currentId;
}

/** Scoped id for the duration of one async action; restores the parent id. */
export async function withCorrelation<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = currentId;
  currentId = id;
  try {
    return await fn();
  } finally {
    currentId = previous;
  }
}

// --- error shipping (warn + error + fatal only) ----------------------------
const SHIP_PATH = "/api/log";
const SHIP_INTERVAL_MS = 5000;
const SHIP_BATCH = 20;
const SHIP_BUFFER_MAX = 100;
const SHIP_LEVELS = new Set<Level>(["warn", "error", "fatal"]);
let pending: string[] = [];
let lastShip = 0;
let shipScheduled = false;

function scheduleShip(): void {
  if (shipScheduled) return;
  shipScheduled = true;
  queueMicrotask(() => {
    shipScheduled = false;
    flushLogs();
  });
}

/** Ships at most one batch per interval. Returns lines sent. Never throws. */
export function flushLogs(): number {
  if (pending.length === 0) return 0;
  const now = Date.now();
  if (now - lastShip < SHIP_INTERVAL_MS) return 0;
  const batch = pending.splice(0, SHIP_BATCH);
  lastShip = now;
  try {
    const nav = globalThis.navigator as { sendBeacon?: (url: string, data: Blob) => boolean } | undefined;
    if (typeof nav?.sendBeacon === "function") {
      const payload = JSON.stringify({ logs: batch.map((line) => JSON.parse(line) as unknown) });
      nav.sendBeacon(SHIP_PATH, new Blob([payload], { type: "application/json" }));
    }
  } catch {
    /* shipping must never break the app */
  }
  return batch.length;
}

/** Test/session hook: drops buffered lines and the rate-limit clock. */
export function resetLogShipping(): void {
  pending = [];
  lastShip = 0;
}

if (typeof window !== "undefined") {
  try {
    window.addEventListener("pagehide", () => {
      void flushLogs();
    });
  } catch {
    /* no window APIs — skip */
  }
}

function env(name: string): string {
  try {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    return g.process?.env?.[name] ?? "";
  } catch {
    return "";
  }
}

function scrub(text: string): string {
  return text
    .replace(/\b(bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .slice(0, 500);
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET.test(key) ? "[REDACTED]" : redact(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return scrub(value);
  if (typeof value === "function" || typeof value === "symbol") return "[UNSERIALIZABLE]";
  return value;
}

export function log(
  level: Level,
  event: string,
  msg: string,
  options: {
    module: string;
    ctx?: Record<string, unknown>;
    error?: LogError;
    correlationId?: string;
  },
): void {
  if (!(level in ORDER)) return;
  try {
    const min = env("LOG_LEVEL") as Level;
    if (min in ORDER && ORDER[level] < ORDER[min]) return;
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      service: "kinetech-web",
      env: env("VERCEL_ENV") || "dev",
      version: env("VERCEL_GIT_COMMIT_SHA") || "dev",
      module: options.module,
      event,
      msg: scrub(msg),
      ...((options.correlationId ?? currentId) ? { correlation_id: options.correlationId ?? currentId } : {}),
    };
    if (options.ctx) record.ctx = redact(options.ctx);
    if (options.error) record.error = { ...options.error, message: scrub(options.error.message) };
    const line = JSON.stringify(record);
    (globalThis as unknown as { console?: { info?: (text: string) => void } }).console?.info?.(line); // allow-print
    if (SHIP_LEVELS.has(level)) {
      pending.push(line);
      if (pending.length > SHIP_BUFFER_MAX) pending.splice(0, pending.length - SHIP_BUFFER_MAX);
      scheduleShip();
    }
  } catch {
    /* logging must never break the app */
  }
}
