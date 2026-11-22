/* kinetech-video-test — Cloudflare Worker that streams ONE Google Drive file
 * per signed token, with Range support and a chunk cache.
 *
 * Routes:
 *   GET|HEAD /v?t=TOKEN      the media stream (token carries the file id)
 *   GET      /meta?t=TOKEN   { mimeType, size } for the same file
 *   GET      /health         deploy + cache-probe status (no token)
 *   OPTIONS  *               CORS preflight
 *
 * The Drive file id NEVER appears in a URL: it lives in the signed token.
 * The Worker never buffers a whole file: responses are capped and sliced from
 * aligned 4 MiB chunks (or an exact range when the platform cache is
 * unavailable, as on *.workers.dev).
 *
 * Free-plan budget (Workers Free): 100k requests/day, 10 ms CPU/request,
 * 50 subrequests/request, 128 MB/isolate. This handler makes 1 metadata
 * subrequest (cached per file) + 1-2 media subrequests per request.
 */

import {
  authFor,
  parseCredentials,
  pickCredential,
  type DriveCredential,
} from "./credentials";
import {
  planFetch,
  probeCache,
  readChunk,
  chunkCacheKey,
  type CacheLike,
} from "./cache";
import { fetchDriveMeta, fetchDriveRange, type DriveMeta } from "./drive";
import {
  corsHeaders,
  preflightHeaders,
  resolveCors,
  streamHeaders,
  unsatisfiableHeaders,
} from "./headers";
import { parseRangeHeader, servedWindow } from "./range";
import { verifyStreamToken } from "./token";

export interface Env {
  STREAM_TOKEN_SECRET: string;
  DRIVE_CREDENTIALS: string;
  ALLOWED_ORIGINS: string;
  CHUNK_BYTES?: string;
  ANALYTICS?: {
    writeDataPoint(point: {
      indexes?: string[];
      blobs?: string[];
      doubles?: number[];
    }): void;
  };
}

const DEFAULT_CHUNK = 4 * 1024 * 1024;
// Cap one response to a single chunk so a request never buffers a whole file
// and stays well inside the free plan's 10 ms CPU budget. The browser asks for
// the next range as playback continues.
const MAX_SERVE_BYTES = DEFAULT_CHUNK;
const RETRY_AFTER_SECONDS = "30";

/** Internal signal: a chunk loader could not get bytes from Drive. */
class ChunkFetchError extends Error {
  readonly kind: "quota" | "error";

  constructor(kind: "quota" | "error") {
    super(kind);
    this.name = "ChunkFetchError";
    this.kind = kind;
  }
}

export type Counters = {
  drive_fetches: number;
  cache_hits: number;
  cache_misses: number;
  quota_errors: number;
  bytes_served: number;
};

let cacheProbePromise: Promise<boolean> | null = null;
let roundRobin = 0;
let credentialCache: { raw: string; pool: DriveCredential[] } | null = null;

function poolFor(env: Env): DriveCredential[] {
  const raw = env.DRIVE_CREDENTIALS ?? "";
  if (credentialCache === null || credentialCache.raw !== raw) {
    credentialCache = { raw, pool: parseCredentials(raw) };
  }
  return credentialCache.pool;
}

function chunkBytes(env: Env): number {
  const parsed = Number(env.CHUNK_BYTES ?? "");
  if (!Number.isFinite(parsed)) return DEFAULT_CHUNK;
  return Math.min(16 * 1024 * 1024, Math.max(64 * 1024, Math.floor(parsed)));
}

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function cacheAvailable(): Promise<boolean> {
  if (cacheProbePromise === null) {
    const cache = (caches as unknown as { default?: CacheLike }).default;
    cacheProbePromise = cache ? probeCache(cache) : Promise.resolve(false);
  }
  return cacheProbePromise;
}

function jsonError(
  error: string,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...cors,
      ...extra,
    },
  });
}

type RangeOutcome =
  | { kind: "ok"; body: ArrayBuffer }
  | { kind: "quota" }
  | { kind: "error" };

/** One media range, trying the next credential once on 403/429/401. */
export async function fetchRangeWithPool(
  env: Env,
  fileId: string,
  start: number,
  end: number,
  counters: Counters,
  signal?: AbortSignal,
): Promise<RangeOutcome> {
  const pool = poolFor(env);
  if (pool.length === 0) return { kind: "quota" };
  const startIndex = roundRobin++;
  const attempts = Math.min(2, pool.length);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const credential = pickCredential(pool, startIndex + attempt);
    if (!credential) continue;
    const auth = await authFor(credential);
    if (!auth) continue;
    counters.drive_fetches += 1;
    const result = await fetchDriveRange(fileId, start, end, auth, fetch, signal);
    if (result.kind === "ok") return { kind: "ok", body: result.body };
    if (result.kind === "quota") {
      counters.quota_errors += 1;
      continue;
    }
    if (result.kind === "auth") continue;
    return { kind: "error" };
  }
  return { kind: "quota" };
}

type MetaOutcome =
  | { kind: "ok"; meta: DriveMeta }
  | { kind: "quota" }
  | { kind: "error" };

export async function fetchMetaWithPool(
  env: Env,
  fileId: string,
  counters: Counters,
): Promise<MetaOutcome> {
  const pool = poolFor(env);
  if (pool.length === 0) return { kind: "quota" };
  const startIndex = roundRobin++;
  const attempts = Math.min(2, pool.length);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const credential = pickCredential(pool, startIndex + attempt);
    if (!credential) continue;
    const auth = await authFor(credential);
    if (!auth) continue;
    const result = await fetchDriveMeta(fileId, auth);
    if (result.kind === "ok") return { kind: "ok", meta: result.meta };
    if (result.kind === "quota") {
      counters.quota_errors += 1;
      continue;
    }
    if (result.kind === "auth") continue;
    return { kind: "error" };
  }
  return { kind: "quota" };
}

function logCounters(
  env: Env,
  route: string,
  status: number,
  counters: Counters,
  cacheState: "available" | "unavailable",
  jti: string,
  fileId: string,
  started: number,
  originSource: string,
): void {
  const record = {
    event: "stream",
    route,
    status,
    cache: cacheState,
    drive_fetches: counters.drive_fetches,
    cache_hits: counters.cache_hits,
    cache_misses: counters.cache_misses,
    quota_errors: counters.quota_errors,
    bytes_served: counters.bytes_served,
    // Prefixes only — never a full id, never a token.
    jti: jti.slice(0, 8),
    fid: fileId.slice(0, 6),
    origin: originSource,
    ms: Date.now() - started,
  };
  try {
    // Workers have no access to the web logger (separate runtime, no shared
    // imports). Structured JSON to stdout IS the sink here: Cloudflare's
    // Workers Logs / `wrangler tail` read it. No token, no full id.
    console.log(JSON.stringify(record)); // allow-print: Worker runtime sink, structured JSON only
  } catch {
    /* logging must never break a stream */
  }
  try {
    env.ANALYTICS?.writeDataPoint({
      indexes: [record.jti],
      blobs: [route, cacheState, String(status), originSource],
      doubles: [
        counters.bytes_served,
        counters.drive_fetches,
        counters.cache_hits,
        counters.cache_misses,
        counters.quota_errors,
      ],
    });
  } catch {
    /* optional binding */
  }
}

async function handleHealth(request: Request, env: Env): Promise<Response> {
  const decision = resolveCors(request, allowedOrigins(env));
  if (!decision.allowed) return jsonError("origin", 403, {});
  const available = await cacheAvailable();
  return new Response(
    JSON.stringify({
      ok: true,
      name: "kinetech-video-test",
      cache: available ? "available" : "unavailable",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
        ...corsHeaders(decision),
      },
    },
  );
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const route = url.pathname;
  const counters: Counters = {
    drive_fetches: 0,
    cache_hits: 0,
    cache_misses: 0,
    quota_errors: 0,
    bytes_served: 0,
  };

  if (request.method === "OPTIONS") {
    const decision = resolveCors(request, allowedOrigins(env));
    const headers = preflightHeaders(decision);
    if (!headers) return jsonError("origin", 403, {});
    return new Response(null, { status: 204, headers });
  }

  if (route === "/health") return handleHealth(request, env);
  if (route !== "/v" && route !== "/meta") {
    return jsonError("not-found", 404, {});
  }

  const decision = resolveCors(request, allowedOrigins(env));
  if (!decision.allowed) {
    logCounters(env, route, 403, counters, "unavailable", "", "", started, decision.source);
    return jsonError("origin", 403, {});
  }
  const cors = corsHeaders(decision);

  const token = url.searchParams.get("t") ?? "";
  const payload = await verifyStreamToken(token, env.STREAM_TOKEN_SECRET ?? "", {
    skewSeconds: 5,
  });
  if (!payload) {
    logCounters(env, route, 401, counters, "unavailable", "", "", started, decision.source);
    return jsonError("unauthorized", 401, cors);
  }

  const metaResult = await fetchMetaWithPool(env, payload.fid, counters);
  if (metaResult.kind === "quota") {
    logCounters(env, route, 503, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return jsonError("quota", 503, cors, { "retry-after": RETRY_AFTER_SECONDS });
  }
  if (metaResult.kind !== "ok") {
    logCounters(env, route, 502, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return jsonError("upstream", 502, cors);
  }
  const meta = metaResult.meta;

  if (route === "/meta") {
    logCounters(env, route, 200, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return new Response(JSON.stringify({ mimeType: meta.mimeType, size: meta.size }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        ...cors,
      },
    });
  }

  const parsed = parseRangeHeader(request.headers.get("range"), meta.size);
  if (parsed.kind === "multi" || parsed.kind === "unsatisfiable") {
    logCounters(env, route, 416, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return new Response(null, { status: 416, headers: unsatisfiableHeaders(meta.size, cors) });
  }

  const chunkSize = chunkBytes(env);
  const window = servedWindow(parsed, meta.size, Math.max(MAX_SERVE_BYTES, chunkSize));
  if (!window) {
    return new Response(null, { status: 416, headers: unsatisfiableHeaders(meta.size, cors) });
  }
  const { start } = window;
  let { end } = window;

  const contentType = meta.mimeType.startsWith("video/") ? meta.mimeType : "video/mp4";

  // HEAD: answer headers only, no upstream body fetch.
  if (request.method === "HEAD") {
    const headers = streamHeaders({ start, end, size: meta.size, contentType, cors });
    logCounters(env, route, 206, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return new Response(null, { status: 206, headers });
  }

  const cacheOn = await cacheAvailable();
  const cacheState = cacheOn ? "available" : "unavailable";
  const plan = planFetch(cacheOn, start, end, meta.size, chunkSize);
  let body: ArrayBuffer | null = null;

  if (plan.mode === "exact") {
    // Fail-safe: no cache on this platform — one exact range, no alignment.
    const result = await fetchRangeWithPool(env, payload.fid, start, end, counters, request.signal);
    if (result.kind === "quota") {
      logCounters(env, route, 503, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return jsonError("quota", 503, cors, { "retry-after": RETRY_AFTER_SECONDS });
    }
    if (result.kind !== "ok") {
      logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return jsonError("upstream", 502, cors);
    }
    body = result.body;
    // Drive may return fewer bytes at EOF; reflect what we actually serve.
    if (body.byteLength > 0) end = Math.min(end, start + body.byteLength - 1);
  } else {
    const cache = (caches as unknown as { default?: CacheLike }).default;
    if (!cache) {
      return jsonError("upstream", 502, cors);
    }
    const parts: Uint8Array[] = [];
    for (const chunk of plan.chunks) {
      // The loader is the ONLY place that talks to Drive for this chunk, so a
      // cache hit costs zero Drive bandwidth and zero subrequests.
      let read: Awaited<ReturnType<typeof readChunk>>;
      try {
        read = await readChunk({
          cache,
          key: chunkCacheKey(payload.fid, chunk.index),
          loader: async () => {
            const result = await fetchRangeWithPool(
              env,
              payload.fid,
              chunk.start,
              chunk.end,
              counters,
              request.signal,
            );
            if (result.kind !== "ok") throw new ChunkFetchError(result.kind);
            return result.body;
          },
          waitUntil: (p) => ctx.waitUntil(p),
        });
      } catch (error) {
        const kind = error instanceof ChunkFetchError ? error.kind : "error";
        if (kind === "quota") {
          logCounters(env, route, 503, counters, cacheState, payload.jti, payload.fid, started, decision.source);
          return jsonError("quota", 503, cors, { "retry-after": RETRY_AFTER_SECONDS });
        }
        logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
        return jsonError("upstream", 502, cors);
      }
      if (read.hit) counters.cache_hits += 1;
      else counters.cache_misses += 1;
      const from = Math.max(start, chunk.start) - chunk.start;
      const to = Math.min(end, chunk.end) - chunk.start;
      parts.push(new Uint8Array(read.buffer, from, to - from + 1));
    }
    const total = end - start + 1;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    body = out.buffer;
  }

  if (!body || body.byteLength === 0) {
    logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
    return jsonError("upstream", 502, cors);
  }

  counters.bytes_served = body.byteLength;
  const headers = streamHeaders({ start, end, size: meta.size, contentType, cors });
  logCounters(env, route, 206, counters, cacheState, payload.jti, payload.fid, started, decision.source);
  return new Response(body, { status: 206, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (request.signal.aborted) {
        return new Response(null, { status: 499 });
      }
      return await handle(request, env, ctx);
    } catch {
      // Never leak an internal stack to the client.
      return new Response(JSON.stringify({ error: "upstream" }), {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "private, no-store",
        },
      });
    }
  },
} satisfies ExportedHandler<Env>;
