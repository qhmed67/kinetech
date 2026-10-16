/* Reference logger (Node, no dependencies). Emits exactly the schema in docs/LOGGING.md.
 * Copy to your infrastructure layer, e.g. src/shared/infrastructure/logger.ts. Call configure() once at startup.
 *   log("info", "order.created", "order created", { module: "orders.application", ctx: { orderId: "o_1" } })
 *   log("error", "order.payment.failed", "payment rejected", { module: "orders.infrastructure", error: e, code: "EXT_001" })
 * HTTP middleware: run each request inside withCorrelation(id, () => next()) so every line carries correlation_id.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

type Level = "debug" | "info" | "warn" | "error" | "fatal"
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 }
const SECRET = /(password|token|secret|authorization|api_?key|cookie|card)/i
const als = new AsyncLocalStorage<{ correlation_id: string }>()
const cfg = { service: "app", env: process.env.APP_ENV ?? "dev", version: "0.0.0", min: (process.env.LOG_LEVEL as Level) ?? "info", file: undefined as string | undefined }

export function configure(o: Partial<typeof cfg>) {
  Object.assign(cfg, o)
  if (cfg.file === undefined && cfg.env === "dev") cfg.file = "logs/app.jsonl"
  if (cfg.file) mkdirSync(dirname(cfg.file), { recursive: true })
}
export const withCorrelation = <T>(id: string, fn: () => T): T => als.run({ correlation_id: id }, fn)
export const currentCorrelationId = () => als.getStore()?.correlation_id

const redact = (v: any): any =>
  Array.isArray(v) ? v.map(redact)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? "[REDACTED]" : redact(x)]))
  : v

export function log(level: Level, event: string, msg: string, o: { module: string; error?: unknown; code?: string; ctx?: Record<string, unknown> }) {
  if (ORDER[level] < ORDER[cfg.min]) return
  const rec: Record<string, unknown> = { ts: new Date().toISOString(), level, service: cfg.service, env: cfg.env, version: cfg.version, module: o.module, event, msg }
  const cid = currentCorrelationId(); if (cid) rec.correlation_id = cid
  if (o.error !== undefined || level === "error" || level === "fatal") {
    const e = o.error as any
    rec.error = { code: o.code ?? "SYS_001", type: e?.name ?? null, message: e?.message ?? msg, cause: e?.cause ? String(e.cause) : null, stack: e?.stack ?? null }
  }
  if (o.ctx) rec.ctx = redact(o.ctx)
  const line = JSON.stringify(rec)
  process.stdout.write(line + "\n") // allow-print
  if (cfg.file) appendFileSync(cfg.file, line + "\n")
}
