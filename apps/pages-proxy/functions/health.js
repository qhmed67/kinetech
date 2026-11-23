/* /health passthrough — returns the Worker's own health JSON so the chain can
 * be probed through the pages.dev hostname. No token, no secrets: the Worker
 * already answers this route with booleans and counts only.
 *
 *   GET /health            -> { ok, name, cache }
 *   GET /health?verbose=1  -> adds secret SHAPES (never values)
 */

const EXPOSE_HEADERS = "Content-Type, Cache-Control, Retry-After";

export async function onRequest(context) {
  const { request, env } = context;
  const workerOrigin = String(env.WORKER_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (workerOrigin === "") {
    return new Response(
      JSON.stringify({ error: "proxy", reason: "proxy_misconfigured", stage: "proxy" }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }

  const url = new URL(request.url);
  try {
    const upstream = await fetch(workerOrigin + "/health" + url.search, {
      method: request.method,
      headers: { accept: "application/json" },
    });
    const out = new Headers(upstream.headers);
    out.set("Access-Control-Expose-Headers", EXPOSE_HEADERS);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return new Response(JSON.stringify({ error: "proxy", reason: "network", stage: "proxy" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
