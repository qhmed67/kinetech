// Client logger — step 13.6.3. Emits the docs/LOGGING.md JSONL schema.
// Step 4 extends this module with request-id context and batch shipping;
// for now the sink is stdout only. Never throws, never logs row data.

export type Level = "debug" | "info" | "warn" | "error" | "fatal";
export type LogError = { code: string; type: string; message: string };

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const SECRET = /(password|token|authorization|cookie|secret|api[-_]?key|email|phone|grant|embedurl|srcurl|playlist|url)/i;

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
      ...(options.correlationId ? { correlation_id: options.correlationId } : {}),
    };
    if (options.ctx) record.ctx = redact(options.ctx);
    if (options.error) record.error = { ...options.error, message: scrub(options.error.message) };
    const line = JSON.stringify(record);
    (globalThis as unknown as { console?: { info?: (text: string) => void } }).console?.info?.(line); // allow-print
  } catch {
    /* logging must never break the app */
  }
}
