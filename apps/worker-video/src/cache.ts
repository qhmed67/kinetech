/* Chunk cache with a workers.dev fail-safe.
 *
 * Cloudflare's Cache API only stores on a custom domain / route; on
 * *.workers.dev it accepts put() but never returns the entry. We therefore
 * probe once per isolate and, when the cache does not stick, skip alignment
 * entirely and fetch the exact requested range from Drive. That avoids
 * spending Drive bandwidth on 4 MiB chunks that can never be reused.
 *
 * The in-flight map still helps in both modes: concurrent requests for the
 * same chunk (or the same exact range) share one upstream fetch.
 */

import { chunksForRange, type Chunk } from "./range";

export type CacheLike = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
};

const CACHE_ORIGIN = "https://cache.kinetech.internal";

/** Synthetic cache key: file id + chunk index. Never the token, never the URL. */
export function chunkCacheKey(fileId: string, index: number): string {
  return `${CACHE_ORIGIN}/chunk/${fileId}/${index}`;
}

/** Probe result detail for diagnostics. */
export type ChunkFetchDetail = { status: number | null; reason: string | null; driveReason: string | null };

/** Internal signal: a chunk loader could not get bytes from Drive/cache. */
export class ChunkFetchError extends Error {
  readonly kind: "quota" | "error" | "cache_error";
  readonly detail: ChunkFetchDetail;

  constructor(kind: "quota" | "error" | "cache_error", detail: ChunkFetchDetail = { status: null, reason: null, driveReason: null }) {
    super(kind);
    this.name = "ChunkFetchError";
    this.kind = kind;
    this.detail = detail;
  }
}

/** One put+match probe. False = the platform does not persist (workers.dev). */
export async function probeCache(cache: CacheLike): Promise<boolean> {
  const key = `${CACHE_ORIGIN}/probe/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await cache.put(
      key,
      new Response("1", { headers: { "content-type": "text/plain", "cache-control": "public, max-age=60" } }),
    );
    const hit = await cache.match(key);
    return hit !== undefined && hit !== null;
  } catch {
    return false;
  }
}

export type FetchPlan =
  | { mode: "exact"; start: number; end: number }
  | { mode: "chunks"; chunks: Chunk[] };

/** The fail-safe decision: no cache → one exact range, no alignment. */
export function planFetch(
  cacheAvailable: boolean,
  start: number,
  end: number,
  size: number,
  chunkSize: number,
): FetchPlan {
  if (!cacheAvailable) return { mode: "exact", start, end };
  return { mode: "chunks", chunks: chunksForRange(start, end, size, chunkSize) };
}

export type ChunkRead = { buffer: ArrayBuffer; hit: boolean };

const inflight = new Map<string, Promise<ArrayBuffer>>();

/** Read one chunk from cache, or load it once (deduped) and cache it in the
 *  background. `hit` reports cache hits for counters. */
export async function readChunk(options: {
  cache: CacheLike;
  key: string;
  loader: () => Promise<ArrayBuffer>;
  waitUntil: (promise: Promise<unknown>) => void;
  /** Optional stage callback for diagnostics ("cache_get"/"cache_put"). */
  onStage?: (stage: string) => void;
}): Promise<ChunkRead> {
  const { cache, key, loader, waitUntil, onStage } = options;
  onStage?.("cache_get");
  try {
    const hit = await cache.match(key);
    if (hit !== undefined && hit !== null) {
      try {
        return { buffer: await hit.arrayBuffer(), hit: true };
      } catch {
        throw new ChunkFetchError("cache_error");
      }
    }
  } catch (error) {
    if (error instanceof ChunkFetchError) throw error;
    /* cache read failed — fall through to upstream */
  }

  const existing = inflight.get(key);
  if (existing) return { buffer: await existing, hit: false };

  const promise = loader()
    .then((buffer) => {
      // Cache a copy; the caller slices its own ArrayBuffer.
      onStage?.("cache_put");
      waitUntil(
        cache
          .put(
            key,
            new Response(buffer.slice(0), {
              headers: { "content-type": "video/mp4", "content-length": String(buffer.byteLength) },
            }),
          )
          .catch(() => undefined),
      );
      return buffer;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return { buffer: await promise, hit: false };
}

/** Test hook. */
export function clearInflight(): void {
  inflight.clear();
}
