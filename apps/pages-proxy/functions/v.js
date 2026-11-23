/* kinetech-pages-proxy — a thin Cloudflare Pages Function that puts the video
 * Worker behind a *.pages.dev hostname.
 *
 * Why this exists: the Worker runs on *.workers.dev, where the Cache API
 * stores nothing (Cloudflare documents that workers.dev has no cache
 * persistence). Pages Functions run on a hostname with a real edge cache, so
 * the same chunked media responses can actually be cached here.
 *
 * What it does — and does not — do:
 *   - It NEVER decides authorization. The signed stream token is passed through
 *     untouched; the Worker verifies it (HMAC + AES-GCM) exactly as before.
 *   - It never sees or logs the Drive file id (it is encrypted inside the
 *     token) and never logs the token itself.
 *   - It forwards the browser's Origin/Referer verbatim so the Worker's
 *     ALLOWED_ORIGINS check still runs against the real caller — the proxy
 *     does not become a hotlink bypass.
 *   - Range requests, 206/416 responses, Content-Range and all diagnostics
 *     pass through unmodified.
 *
 * Binding: WORKER_ORIGIN (see wrangler/pages config + the setup notes).
 *   Set it to the Worker origin, e.g. https://kinetech-video-test.<acct>.workers.dev
 *   No trailing slash. Never include a path.
 *
 * Routes served by this file:
 *   GET|HEAD /v?t=TOKEN     ->  <WORKER_ORIGIN>/v?t=TOKEN
 */

const PASSTHROUGH_HEADERS = [
  "range",
  "if-range",
  "origin",
  "referer",
  "accept",
  "accept-encoding",
];

/** Response headers the browser needs to read, on success AND on errors, so a
 *  failure surfaces a reason instead of an opaque network error. */
const EXPOSE_HEADERS =
  "Content-Range, Content-Length, Accept-Ranges, Content-Type, Cache-Control, " +
  "ETag, Retry-After, X-Kt-Reason, X-Kt-Stage";

export async function onRequest(context) {
  const { request, env } = context;

  const workerOrigin = String(env.WORKER_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (workerOrigin === "") {
    return json(500, "proxy_misconfigured", null);
  }

  // Only GET/HEAD reach the media path; everything else is a preflight or a
  // mistake, and the Worker answers both correctly — so forward them as-is.
  const url = new URL(request.url);
  const target = workerOrigin + url.pathname + url.search;

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // NOTE: this does NOT make the Worker's chunk cache work. The Worker's cache
  // probe runs inside the WORKER's isolate, on the workers.dev hostname — a
  // proxy in front of it cannot change that. What this proxy buys is a place
  // where a *future* cache could live (a Pages-side cache keyed by the
  // tokenised URL), and it is the first place a custom-domain route would
  // make sense. Do not claim caching here until it is implemented and
  // measured.
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    // Stream the body straight through — never buffer a whole file here.
    cf: { cacheEverything: false },
  };

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch {
    return json(502, "network", null);
  }

  const out = new Headers(upstream.headers);
  // Let the browser read the diagnostic headers on error responses too.
  out.set("Access-Control-Expose-Headers", EXPOSE_HEADERS);
  // The proxy hostname is the caller's origin from now on; the Worker already
  // applied the policy to the forwarded Origin.
  out.set("Vary", "Origin, Range");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

function json(status, reason, upstreamStatus) {
  const body = {
    error: "proxy",
    reason,
    upstream_status: upstreamStatus,
    drive_reason: null,
    stage: "proxy",
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-expose-headers": EXPOSE_HEADERS,
    },
  });
}
