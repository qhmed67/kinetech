import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClient } from "@kinetech/core";
import { getSupabaseEnv, isSupabaseConfigured } from "./env";
import { log } from "../logger";

export { isSupabaseConfigured };

let client: SupabaseClient | null = null;

type QueryResult = { data?: unknown; error?: unknown };

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value.slice(0, 500) : null;
}

function finish(label: string, started: number, result?: QueryResult, thrown?: unknown): void {
  const duration = Date.now() - started;
  const error = result?.error ?? thrown;
  const raw = (error && typeof error === "object" ? error : {}) as Record<string, unknown>;
  const rows = Array.isArray(result?.data) ? result.data.length : result?.data == null ? 0 : 1;
  const ctx: Record<string, unknown> = {
    label,
    duration_ms: duration,
    rows,
    postgres_code: text(raw.code),
    constraint: text(raw.constraint),
    table: text(raw.table),
    column: text(raw.column),
    detail: text(raw.details ?? raw.detail),
    hint: text(raw.hint),
  };
  const event = error ? "db.query.failed" : duration > 500 ? "db.query.slow" : "db.query.ok";
  log(error ? "warn" : duration > 500 ? "warn" : "info", event, `${label}: ${error ? "failed" : "ok"}`, {
    module: "db.client",
    ctx,
    error: error
      ? {
          code: "DB_001",
          type: text(raw.name) ?? "PostgrestError",
          message: text(raw.message) ?? "database query failed",
        }
      : undefined,
  });
}

function isThenable(value: unknown): value is object {
  return value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function";
}

/** Keeps the postgrest chain intact while logging once when it is awaited. */
function timed<T extends object>(builder: T, label: string, started: number): T {
  let done = false;
  return new Proxy(builder, {
    get(target, prop) {
      if (prop === "then") {
        return (onFulfilled?: unknown, onRejected?: unknown) => {
          const original = Reflect.get(target, "then") as (onF?: unknown, onR?: unknown) => unknown;
          const logged = Promise.resolve(original.call(target)).then(
            (result) => {
              if (!done) {
                done = true;
                finish(label, started, result as QueryResult);
              }
              return result;
            },
            (error: unknown) => {
              if (!done) {
                done = true;
                finish(label, started, undefined, error);
              }
              throw error;
            },
          );
          return logged.then(
            onFulfilled as ((value: unknown) => unknown) | undefined,
            onRejected as ((reason: unknown) => unknown) | undefined,
          );
        };
      }
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const next = Reflect.apply(value as (...a: unknown[]) => unknown, target, args);
        return isThenable(next) ? timed(next, label, started) : next;
      };
    },
  }) as T;
}

/** Singleton via core factory. Returns null when .env is incomplete (mock fallback stays active). */
export function supabase(): SupabaseClient | null {
  const { url, key } = getSupabaseEnv();
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const raw = createSupabaseClient({ url, key }) as SupabaseClient | null;
    if (!raw) return null;
    client = new Proxy(raw, {
      get(target, prop) {
        if (prop === "from") {
          return (table: string) => {
            const label = `from.${table}`;
            return timed(target.from(table) as object, label, Date.now());
          };
        }
        if (prop === "rpc") {
          return (name: string, args?: unknown) => {
            const label = `rpc.${name}`;
            return timed(target.rpc(name, args) as object, label, Date.now());
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  return client;
}
