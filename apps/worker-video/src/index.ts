/* kinetech-video-test — Cloudflare Worker that streams ONE Google Drive file
 * per signed token, with Range support and a chunk cache.
 *
 * Routes:
 *   GET|HEAD /v?t=TOKEN      the media stream (token carries the encrypted
 *                            Drive file id — never in the URL)
 *   GET      /meta?t=TOKEN   { mimeType, size } for the same file
 *   GET      /health         deploy + cache-probe status (no token)
 *   GET      /health?verbose=1  secret SHAPES only (booleans + counts)
 *   GET      /check-origin?o=<origin>  { allowed: boolean } (no token)
 *   OPTIONS  *               CORS preflight
 *
 * The Drive file id NEVER appears in a URL or a token: it is encrypted inside
 * the signed token (AES-GCM, HKDF-derived key) and decrypted here.
 * The Worker never buffers a whole file: responses are capped and sliced from
 * aligned 4 MiB chunks (or an exact range when the platform cache is
 * unavailable, as on *.workers.dev).
 *
 * Error bodies are structured, non-secret diagnostics:
 *   { "error": "quota"|"upstream"|"range"|"origin"|"not-found"|"unauthorized",
 *     "reason": "<code>", "upstream_status": <number|null>,
 *     "drive_reason": "<Google error.errors[0].reason|null>", "stage": "<label>" }
 * Reason taxonomy: origin_not_allowed | origin_missing_policy | bad_token_format |
 * bad_signature | expired | pool_empty | credentials_parse_error | drive_403 |
 * drive_404 | drive_429 | drive_5xx | meta_failed | range_unsatisfiable |
 * range_ignored | content_range_mismatch | empty_body | network | cache_error |
 * internal. No tokens, Drive ids or URLs are ever returned or logged.
 *
 * Free-plan budget (Workers Free): 100k requests/day, 10 ms CPU/request,
 * 50 subrequests/request, 128 MB/isolate. This handler makes 1 metadata
 * subrequest (cached per file) + 1-2 media subrequests per request.
 */

import {
  authFor,
  parseCredentialsDetailed,
  pickCredential,
  type DriveCredential,
} from "./credentials";
import {
  planFetch,
  probeCache,
  readChunk,
  chunkCacheKey,
  ChunkFetchError,
  type CacheLike,
} from "./cache";
import { fetchDriveMeta, fetchDriveRange, type DriveMeta, type DriveQuota, type DriveError } from "./drive";
import {
  corsHeaders,
  normalizeOriginPattern,
  preflightHeaders,
  resolveCors,
  streamHeaders,
  checkOriginAllowed,
} from "./headers";
import { parseRangeHeader, servedWindow } from "./range";
import { verifyStreamToken, type VerifiedStreamTokenPayload } from "./token";
import type { CorsDecision } from "./headers";
import type { CredentialsShape } from "./credentials";
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
// Git short SHA of the deployed build (see `git rev-parse --short HEAD`).
const VERSION = "38dfae3";

export type Counters = {
  drive_fetches: number;
  cache_hits: number;
  cache_misses: number;
  quota_errors: number;
  bytes_served: number;
};

let cacheProbePromise: Promise<boolean> | null = null;
let roundRobin = 0;
let credentialCache: { raw: string; credentials: DriveCredential[]; shape: CredentialsShape } | null = null;

function poolFor(env: Env): { credentials: DriveCredential[]; shape: CredentialsShape } {
  const raw = env.DRIVE_CREDENTIALS ?? "";
  if (credentialCache === null || credentialCache.raw !== raw) {
    const detailed = parseCredentialsDetailed(raw);
    credentialCache = { raw, credentials: detailed.credentials, shape: detailed.shape };
  }
  return credentialCache;
}

/** Why the pool is unusable, or null when it has usable credentials. */
function poolFailureReason(env: Env): string | null {
  const raw = (env.DRIVE_CREDENTIALS ?? "").trim();
  if (raw === "") return "credentials_parse_error";
  const { credentials, shape } = poolFor(env);
  if (credentials.length > 0) return null;
  return shape === "invalid" ? "credentials_parse_error" : "pool_empty";
}

function chunkBytes(env: Env): number {
  const parsed = Number(env.CHUNK_BYTES ?? "");
  if (!Number.isFinite(parsed)) return DEFAULT_CHUNK;
  return Math.min(16 * 1024 * 1024, Math.max(64 * 1024, Math.floor(parsed)));
}

/** ALLOWED_ORIGINS is fail-soft: split on commas and whitespace, trim, strip
 *  one layer of quotes, drop trailing slashes, lowercase hostnames. */
function allowedOrigins(env: Env): string[] {
  const out: string[] = [];
  for (const part of (env.ALLOWED_ORIGINS ?? "").split(/[\s,]+/)) {
    const normalized = normalizeOriginPattern(part);
    if (normalized !== null) out.push(normalized);
  }
  return out;
}

export type ErrorBody = {
  error: string;
  reason: string;
  upstream_status: number | null;
  drive_reason: string | null;
  stage?: string;
};

function errorBody(opts: {
  status: number;
  error: string;
  reason: string;
  cors: Record<string, string>;
  upstreamStatus?: number | null;
  driveReason?: string | null;
  stage?: string;
}): Response {
  const body: ErrorBody = {
    error: opts.error,
    reason: opts.reason,
    upstream_status: opts.upstreamStatus ?? null,
    drive_reason: opts.driveReason ?? null,
  };
  if (opts.stage !== undefined) body.stage = opts.stage;
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    ...opts.cors,
  };
  // Compat: quota responses were told to retry after a few seconds.
  if (opts.status === 503 && opts.error === "quota") {
    headers["retry-after"] = RETRY_AFTER_SECONDS;
  }
  return new Response(JSON.stringify(body), { status: opts.status, headers });
}

export type RangeOutcome = { kind: "ok"; body: ArrayBuffer } | DriveQuota | DriveError;

type MetaOutcome = { kind: "ok"; meta: DriveMeta } | DriveQuota | DriveError;

function emptyPoolOutcome(): RangeOutcome {
  return { kind: "quota", status: 503, reason: "pool_empty", drive_reason: null };
}

function emptyMetaPoolOutcome(): MetaOutcome {
  return { kind: "quota", status: 503, reason: "pool_empty", drive_reason: null };
}

/** One media range, trying the next credential once on 403/429. */
export async function fetchRangeWithPool(
  env: Env,
  fileId: string,
  start: number,
  end: number,
  counters: Counters,
  signal?: AbortSignal,
): Promise<RangeOutcome> {
  const pool = poolFor(env).credentials;
  if (pool.length === 0) {
    return { kind: "quota", status: 503, reason: poolFailureReason(env) ?? "pool_empty", drive_reason: null };
  }
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
    return result;
  }
  return emptyPoolOutcome();
}

async function fetchMetaWithPool(
  env: Env,
  fileId: string,
  counters: Counters,
): Promise<MetaOutcome> {
  const pool = poolFor(env).credentials;
  if (pool.length === 0) {
    return { kind: "quota", status: 503, reason: poolFailureReason(env) ?? "pool_empty", drive_reason: null };
  }
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
    return result;
  }
  return emptyMetaPoolOutcome();
}

async function cacheAvailable(): Promise<boolean> {
  if (cacheProbePromise === null) {
    const globalCaches = (globalThis as { caches?: { default?: CacheLike } }).caches;
    const cache = globalCaches?.default;
    cacheProbePromise = cache ? probeCache(cache) : Promise.resolve(false);
  }
  return cacheProbePromise;
}

function logCounters(
  env: Env,
  route: string,
  statusCode: number,
  counters: Counters,
  cacheState: "available" | "unavailable",
  jti: string,
  fid: string,
  started: number,
  originSource: string,
): void {
  const record = {
    event: "stream",
    route,
    status: statusCode,
    cache: cacheState,
    drive_fetches: counters.drive_fetches,
    cache_hits: counters.cache_hits,
    cache_misses: counters.cache_misses,
    quota_errors: counters.quota_errors,
    bytes_served: counters.bytes_served,
    // Prefixes only — never a full id, never a token.
    jti: jti.slice(0, 8),
    fid: fid.slice(0, 6),
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
      blobs: [route, cacheState, String(statusCode), originSource],
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

async function handleHealth(decision: CorsDecision): Promise<Response> {
  if (!decision.allowed) {
    const reason = decision.source === "origin" ? "origin_not_allowed" : "origin_missing_policy";
    return errorBody({ status: 403, error: "origin", reason, cors: corsHeaders(decision) });
  }
  const available = await cacheAvailable();
  return new Response(
    JSON.stringify({ ok: true, name: "kinetech-video-test", cache: available ? "available" : "unavailable" }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        ...corsHeaders(decision),
      },
    },
  );
}

/** /health?verbose=1 — booleans and counts ONLY, never values. */
async function handleHealthVerbose(env: Env): Promise<Response> {
  const pool = poolFor(env);
  const allowed = allowedOrigins(env);
  const cacheOn = await cacheAvailable();
  const body = {
    ok: true,
    name: "kinetech-video-test",
    cache: cacheOn ? "available" : "unavailable",
    version: VERSION,
    secrets: {
      STREAM_TOKEN_SECRET: { present: (env.STREAM_TOKEN_SECRET ?? "").trim() !== "" },
      DRIVE_CREDENTIALS: {
        present: (env.DRIVE_CREDENTIALS ?? "").trim() !== "",
        parses: pool.shape !== "invalid",
        shape: pool.shape,
        enabledCount: pool.credentials.length,
      },
      ALLOWED_ORIGINS: {
        present: (env.ALLOWED_ORIGINS ?? "").trim() !== "",
        count: allowed.length,
        wildcardCount: allowed.filter((o) => o.includes("*")).length,
      },
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** /check-origin?o=<origin> — is this origin allowed? No token needed. */
function handleCheckOrigin(request: Request, env: Env, decision: CorsDecision): Response {
  const url = new URL(request.url);
  const v = (url.searchParams.get("o") ?? "").trim();
  const allowed = v !== "" && checkOriginAllowed(v, allowedOrigins(env));
  return new Response(JSON.stringify({ allowed }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...corsHeaders(decision),
    },
  });
}

async function handle(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  decision: CorsDecision,
  stage: { current: string },
): Promise<Response> {
  const cors = corsHeaders(decision);
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
    const headers = preflightHeaders(decision);
    if (!headers) {
      const reason = decision.source === "origin" ? "origin_not_allowed" : "origin_missing_policy";
      return errorBody({ status: 403, error: "origin", reason, cors });
    }
    return new Response(null, { status: 204, headers });
  }

  if (route === "/health") {
    if (url.searchParams.get("verbose") === "1") return handleHealthVerbose(env);
    return handleHealth(decision);
  }
  if (route === "/check-origin") return handleCheckOrigin(request, env, decision);
  if (route !== "/v" && route !== "/meta") {
    return errorBody({ status: 404, error: "not-found", reason: "route", cors });
  }

  if (!decision.allowed) {
    const reason = decision.source === "origin" ? "origin_not_allowed" : "origin_missing_policy";
    logCounters(env, route, 403, counters, "unavailable", "", "", started, decision.source);
    return errorBody({ status: 403, error: "origin", reason, cors, stage: "origin" });
  }

  // Token
  stage.current = "token";
  const token = url.searchParams.get("t") ?? "";
  const verify = await verifyStreamToken(token, env.STREAM_TOKEN_SECRET ?? "", { skewSeconds: 5 });
  if (!verify.ok) {
    logCounters(env, route, 401, counters, "unavailable", "", "", started, decision.source);
    return errorBody({ status: 401, error: "unauthorized", reason: verify.reason, cors, stage: "token" });
  }
  const payload: VerifiedStreamTokenPayload = verify.payload;

  // Metadata (1 subrequest, cached per file for an hour)
  stage.current = "meta";
  const metaResult = await fetchMetaWithPool(env, payload.fid, counters);
  if (metaResult.kind === "quota") {
    logCounters(env, route, metaResult.status, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return errorBody({
      status: metaResult.status,
      error: "quota",
      reason: metaResult.reason,
      upstreamStatus: metaResult.status,
      driveReason: metaResult.drive_reason,
      cors,
      stage: "meta",
    });
  }
  if (metaResult.kind !== "ok") {
    logCounters(env, route, 502, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return errorBody({
      status: 502,
      error: "upstream",
      reason: metaResult.reason,
      upstreamStatus: metaResult.status,
      driveReason: metaResult.drive_reason,
      cors,
      stage: "meta",
    });
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
    return errorBody({ status: 416, error: "range", reason: "range_unsatisfiable", cors, stage: "range" });
  }

  const chunkSize = chunkBytes(env);
  const window = servedWindow(parsed, meta.size, Math.max(MAX_SERVE_BYTES, chunkSize));
  if (!window) {
    logCounters(env, route, 416, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return errorBody({ status: 416, error: "range", reason: "range_unsatisfiable", cors, stage: "range" });
  }
  const { start } = window;
  let { end } = window;

  const contentType = meta.mimeType.startsWith("video/") ? meta.mimeType : "video/mp4";

  if (request.method === "HEAD") {
    const headers = streamHeaders({ start, end, size: meta.size, contentType, cors });
    logCounters(env, route, 206, counters, "unavailable", payload.jti, payload.fid, started, decision.source);
    return new Response(null, { status: 206, headers });
  }

  stage.current = "cache_get";
  const cacheOn = await cacheAvailable();
  const cacheState = cacheOn ? "available" : "unavailable";
  const plan = planFetch(cacheOn, start, end, meta.size, chunkSize);
  let body: ArrayBuffer | null = null;

  if (plan.mode === "exact") {
    // Fail-safe: no cache on this platform — one exact range, no alignment.
    const result = await fetchRangeWithPool(env, payload.fid, start, end, counters, request.signal);
    if (result.kind === "quota") {
      logCounters(env, route, result.status, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return errorBody({
        status: result.status,
        error: "quota",
        reason: result.reason,
        upstreamStatus: result.status,
        driveReason: result.drive_reason,
        cors,
        stage: "range",
      });
    }
    if (result.kind === "error") {
      logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return errorBody({
        status: 502,
        error: "upstream",
        reason: result.reason,
        upstreamStatus: result.status,
        driveReason: result.drive_reason,
        cors,
        stage: "range",
      });
    }
    const buf = result.body;
    if (buf.byteLength === 0) {
      logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return errorBody({
        status: 502,
        error: "upstream",
        reason: "content_range_mismatch",
        cors,
        stage: "range",
      });
    }
    body = buf;
    // Drive may return fewer bytes at EOF; reflect what we actually serve.
    end = Math.min(end, start + buf.byteLength - 1);
  } else {
    const cache = (caches as unknown as { default?: CacheLike }).default;
    if (!cache) {
      logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return errorBody({ status: 502, error: "upstream", reason: "cache_error", cors, stage: "cache_get" });
    }
    const parts: Uint8Array[] = [];
    for (const chunk of plan.chunks) {
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
            if (result.kind !== "ok") {
              const detail =
                result.kind === "error"
                  ? { status: result.status, reason: result.reason, driveReason: result.drive_reason }
                  : { status: result.status, reason: "pool_empty", driveReason: null };
              throw new ChunkFetchError(result.kind === "error" ? "error" : "quota", detail);
            }
            return result.body;
          },
          waitUntil: (p) => ctx.waitUntil(p),
          onStage: (s) => {
            stage.current = s;
          },
        });
      } catch (error) {
        if (error instanceof ChunkFetchError) {
          if (error.kind === "quota") {
            logCounters(env, route, 503, counters, cacheState, payload.jti, payload.fid, started, decision.source);
            return errorBody({
              status: 503,
              error: "quota",
              reason: error.detail.reason ?? "pool_empty",
              upstreamStatus: error.detail.status,
              driveReason: error.detail.driveReason,
              cors,
              stage: "cache_get",
            });
          }
          if (error.kind === "cache_error") {
            logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
            return errorBody({ status: 502, error: "upstream", reason: "cache_error", cors, stage: "cache_get" });
          }
          logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
          return errorBody({
            status: 502,
            error: "upstream",
            reason: error.detail.reason ?? "upstream",
            upstreamStatus: error.detail.status,
            driveReason: error.detail.driveReason,
            cors,
            stage: "cache_get",
          });
        }
        logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
        return errorBody({ status: 502, error: "upstream", reason: "internal", cors, stage: "internal" });
      }
      if (read.hit) counters.cache_hits += 1;
      else counters.cache_misses += 1;
      const from = Math.max(start, chunk.start) - chunk.start;
      const to = Math.min(end, chunk.end) - chunk.start;
      if (to < from) {
        logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
        return errorBody({ status: 502, error: "upstream", reason: "content_range_mismatch", cors, stage: "range" });
      }
      parts.push(new Uint8Array(read.buffer, from, to - from + 1));
    }
    const total = end - start + 1;
    if (parts.length === 0 || parts.reduce((acc, p) => acc + p.byteLength, 0) !== total) {
      logCounters(env, route, 502, counters, cacheState, payload.jti, payload.fid, started, decision.source);
      return errorBody({ status: 502, error: "upstream", reason: "content_range_mismatch", cors, stage: "range" });
    }
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
    return errorBody({ status: 502, error: "upstream", reason: "empty_body", cors, stage: "range" });
  }

  counters.bytes_served = body.byteLength;
  const headers = streamHeaders({ start, end, size: meta.size, contentType, cors });
  stage.current = "respond";
  logCounters(env, route, 206, counters, cacheState, payload.jti, payload.fid, started, decision.source);
  return new Response(body, { status: 206, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const decision = resolveCors(request, allowedOrigins(env));
    const stage = { current: "route" };
    try {
      if (request.signal.aborted) {
        return new Response(null, { status: 499 });
      }
      return await handle(request, env, ctx, decision, stage);
    } catch {
      // Never leak an internal stack to the client.
      return errorBody({
        status: 502,
        error: "upstream",
        reason: "internal",
        cors: corsHeaders(decision),
        stage: stage.current,
      });
    }
  },
} satisfies ExportedHandler<Env>;

// Re-exported for unit tests.
export { checkOriginAllowed, normalizeOriginPattern };
export { errorBody };
