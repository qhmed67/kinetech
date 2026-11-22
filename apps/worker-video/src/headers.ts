/* CORS/origin policy and byte-range response headers.
 *
 * Hotlink policy: when an Origin or Referer IS present it must match
 * ALLOWED_ORIGINS. When neither is present we allow the request — HTML media
 * elements are no-cors requests and commonly omit Origin, so rejecting them
 * would break legitimate playback; the token is the real gate. A request with
 * no origin that is not GET/HEAD is denied (policy missing).
 *
 * ALLOWED_ORIGINS parsing (fail-soft): split on commas and whitespace, trim,
 * strip one layer of surrounding quotes, strip trailing slashes, lowercase
 * hostnames. Exact entries match scheme + host + port. Wildcard entries are
 * matched by an anchored string matcher — `*` is any run of characters, so
 * `https://*.vercel.app` matches any host ending in `.vercel.app` (hyphens
 * and multiple labels included), with no regex injection.
 */

export type CorsDecision = {
  allowed: boolean;
  /** the origin used for the decision (Origin, else Referer origin) */
  origin: string | null;
  /** which header supplied it — for counters only */
  source: "origin" | "referer" | "none";
};

/** Normalize an origin to `scheme://host[:port]`, lowercased. Returns null for
 *  empty/invalid values. */
export function normalizeOriginValue(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  try {
    const u = new URL(v);
    if (u.protocol === "" || u.hostname === "") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Normalize an ALLOWED_ORIGINS entry: trim, strip a matching pair of
 *  surrounding quotes, strip trailing slashes, lowercase scheme+host+port.
 *  Null for entries that carry no origin. */
export function normalizeOriginPattern(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  let body = v;
  const first = body[0];
  const last = body[body.length - 1];
  if (body.length >= 2 && ((first === '"' && last === '"') || (first === "'" && last === "'"))) {
    body = body.slice(1, -1).trim();
  }
  body = body.replace(/\/+$/, "");
  if (body === "") return null;
  try {
    const u = new URL(body);
    if (u.protocol === "" || u.hostname === "") return null;
    return u.protocol.toLowerCase() + "//" + u.hostname.toLowerCase() + (u.port ? ":" + u.port : "");
  } catch {
    return null;
  }
}

/** Anchored wildcard match. Split on "*": the value must start with the first
 *  literal (when non-empty) and end with the last literal, with the middle
 *  literals found in order — no regex is involved, so patterns cannot inject
 *  anything. `*` matches any run of characters. */
function wildcardMatch(pattern: string, value: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === value;
  let pos = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (i === 0) {
      if (!value.startsWith(part)) return false;
      pos = part.length;
      if (i === parts.length - 1) return pos === value.length;
    } else if (i === parts.length - 1) {
      if (!value.endsWith(part)) return false;
      return value.length - part.length >= pos;
    } else {
      const found = value.indexOf(part, pos);
      if (found < 0) return false;
      pos = found + part.length;
    }
  }
  return true;
}

export function matchOrigin(origin: string, patterns: string[]): boolean {
  const n = normalizeOriginValue(origin);
  return n !== null && patterns.some((p) => wildcardMatch(p, n));
}

/** Is this origin allowed by these patterns? */
export function checkOriginAllowed(origin: string, patterns: string[]): boolean {
  return matchOrigin(origin, patterns);
}

export function resolveCors(request: Request, allowedPatterns: string[]): CorsDecision {
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    const origin = normalizeOriginValue(originHeader);
    return {
      allowed: origin !== null && matchOrigin(origin, allowedPatterns),
      origin,
      source: "origin",
    };
  }
  const referer = request.headers.get("referer");
  if (referer) {
    let origin: string | null = null;
    try {
      origin = new URL(referer).origin;
    } catch {
      origin = null;
    }
    return {
      allowed: origin !== null && matchOrigin(origin, allowedPatterns),
      origin,
      source: "referer",
    };
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return { allowed: false, origin: null, source: "none" };
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
