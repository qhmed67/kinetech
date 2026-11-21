/* Small helpers for the Cloudflare Worker (2027-architecture.md §2.4). */

/** Structural R2 types — the real binding satisfies them, and the unit tests
 *  can supply a fake bucket without the workers test pool. */
export interface R2ObjectBodyLike {
  body: ReadableStream;
  size: number;
  range?: { offset: number; length: number };
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBodyLike | null>;
}

export interface Env {
  /** Private R2 bucket with the encrypted HLS lessons. */
  VIDEOS: R2BucketLike;
  /** HMAC secret for playback tokens (wrangler secret put GRANT_SECRET). */
  GRANT_SECRET: string;
  /** Optional previous secret, so tokens issued before a rotation still work. */
  GRANT_SECRET_PREV?: string;
}

export type ByteRange = { offset: number; length: number };

/** Parse a single-range `Range: bytes=...` header. Returns null when the
 *  header is absent or not a simple range. */
export function parseRangeHeader(
  header: string | null,
  size: number,
): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (startRaw === "" && endRaw === "") return null;

  let offset = 0;
  let length = 0;

  if (startRaw === "") {
    // suffix range: the last N bytes
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    length = Math.min(suffix, size);
    offset = Math.max(0, size - length);
  } else {
    const start = Number(startRaw);
    if (!Number.isFinite(start) || start >= size) return null;
    offset = start;
    const end = endRaw === "" ? size - 1 : Number(endRaw);
    if (!Number.isFinite(end) || end < offset) return null;
    length = Math.min(end - offset + 1, size - offset);
  }

  return { offset, length };
}

/** Basic per-token rate limit.
 *
 * The counter lives in the Worker's memory, so it is PER ISOLATE — a best
 * effort brake, not a global limit. A Durable Object would be needed for a
 * global one; the free tier allows both, but the isolate-local limiter is
 * enough to stop a runaway client from burning the daily request budget. */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class TokenRateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 120, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(token: string, now = Date.now()): RateLimitResult {
    const entry = this.hits.get(token);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(token, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Drop expired entries so the map cannot grow forever. */
  sweep(now = Date.now()): void {
    for (const [token, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(token);
    }
  }
}
