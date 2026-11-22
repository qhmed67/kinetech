/* CORS/origin policy and byte-range response headers.
 *
 * Hotlink policy: when an Origin or Referer IS present it must match
 * ALLOWED_ORIGINS (exact or with `*`). When neither is present we allow the
 * request — HTML media elements are no-cors requests and commonly omit
 * Origin, so rejecting them would break legitimate playback. The token is the
 * real gate; this policy just stops other sites embedding the Worker URL.
 */

export type CorsDecision = {
  allowed: boolean;
  /** the origin used for the decision (Origin, else Referer origin) */
  origin: string | null;
  /** which header supplied it — for counters only */
  source: "origin" | "referer" | "none";
};

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchOrigin(origin: string, patterns: string[]): boolean {
  if (origin === "") return false;
  return patterns.some((p) => p !== "" && patternToRegExp(p).test(origin));
}

export function resolveCors(request: Request, allowedPatterns: string[]): CorsDecision {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    return {
      allowed: matchOrigin(originHeader, allowedPatterns),
      origin: originHeader,
      source: "origin",
    };
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const origin = new URL(referer).origin;
      return { allowed: matchOrigin(origin, allowedPatterns), origin, source: "referer" };
    } catch {
      return { allowed: false, origin: null, source: "referer" };
    }
  }
  return { allowed: true, origin: null, source: "none" };
}

/** CORS response headers. ACAO is only added for a real Origin (CORS mode);
 *  a Referer-only request does not need it. */
export function corsHeaders(decision: CorsDecision): Record<string, string> {
  if (decision.source !== "origin" || decision.origin === null) return {};
  if (!decision.allowed) return {};
  return {
    "access-control-allow-origin": decision.origin,
    "access-control-expose-headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
    vary: "Origin",
  };
}

export function preflightHeaders(decision: CorsDecision): Record<string, string> | null {
  if (!decision.allowed) return null;
  if (decision.source !== "origin" || decision.origin === null) return null;
  return {
    "access-control-allow-origin": decision.origin,
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range, Content-Type",
    "access-control-expose-headers": "Content-Range, Accept-Ranges, Content-Length, Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export type StreamHeaderInput = {
  start: number;
  end: number;
  size: number;
  contentType: string;
  cors: Record<string, string>;
};

/** 206 headers for one served window. */
export function streamHeaders(input: StreamHeaderInput): Headers {
  const headers = new Headers({
    "content-type": input.contentType,
    "content-length": String(input.end - input.start + 1),
    "content-range": `bytes ${input.start}-${input.end}/${input.size}`,
    "accept-ranges": "bytes",
    // The browser must not cache protected media; the Worker's own cache is
    // keyed by file + chunk and is invisible to the client.
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    ...input.cors,
  });
  return headers;
}

/** 416 headers: the only safe answer to a malformed / unsatisfiable range. */
export function unsatisfiableHeaders(size: number, cors: Record<string, string>): Headers {
  return new Headers({
    "content-range": `bytes */${size}`,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-length": "0",
    "x-content-type-options": "nosniff",
    ...cors,
  });
}
