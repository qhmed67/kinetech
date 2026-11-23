# pages.dev proxy — setup notes

A Cloudflare **Pages Function** that fronts the video Worker so media is served
from a `*.pages.dev` hostname instead of `*.workers.dev`.

## What this does and does not do

| | |
|---|---|
| Forwards `/v?t=TOKEN` and `/health` to the Worker | yes |
| Authorises requests | **no** — the Worker verifies the signed token exactly as before |
| Exposes the Drive file id | **no** — it is encrypted inside the token |
| Bypasses the Worker's `ALLOWED_ORIGINS` hotlink check | **no** — `Origin`/`Referer` are forwarded verbatim |
| Makes the Worker's chunk cache work | **no** — see the honest note below |

**The cache still does not work.** The Worker probes `caches.default` inside its
own isolate on the `workers.dev` hostname, where Cloudflare stores nothing. A
proxy in front of it cannot change what the Worker itself caches. The only way
to get real Worker-side caching is a custom domain / route on the Worker
(Workers → Settings → Domains & Routes). This proxy is a separate idea: give the
chain a hostname where a *Pages-side* cache could later live. It is not
implemented or measured — do not expect cache hits from it.

## Files

```
apps/pages-proxy/
├── functions/v.js        GET|HEAD /v?t=TOKEN  → <WORKER_ORIGIN>/v?t=TOKEN
├── functions/health.js   GET /health[?verbose=1] → <WORKER_ORIGIN>/health…
└── public/index.html     placeholder (Pages requires a deploy directory)
```

## Binding name

The one binding the functions need:

| Name | Type | Value |
|---|---|---|
| `WORKER_ORIGIN` | **Plain text variable** (not a secret) | `https://kinetech-video-test.<account>.workers.dev` |

No trailing slash, no path. It is not a secret — it is the Worker's public
origin, the same value that already sits in Vercel as `VIDEO_STREAM_WORKER_URL`.

## Exact dashboard steps (no CLI, no Cloudflare access needed from the agent)

1. **Create the project.** Cloudflare dashboard → **Workers & Pages** →
   **Create** → **Pages** → **Upload assets** (direct upload, not Git).
2. Name it `kinetech-pages-proxy` → **Create project**.
3. Upload the contents of `apps/pages-proxy/public/` as the first deployment
   (the placeholder `index.html` is enough to create it).
4. **Add the binding.** Project → **Settings** → **Variables and Secrets** →
   **Production** → **Add** → name `WORKER_ORIGIN`, value
   `https://kinetech-video-test.<account>.workers.dev` → **Save**.
   (Plain text, not encrypted.)
5. **Deploy the functions.** With `functions/` present at the root of what you
   upload, Pages picks them up automatically. From the repo:
   ```bash
   npx wrangler pages deploy apps/pages-proxy --project-name kinetech-pages-proxy
   ```
   That command uploads `public/` as static assets and `functions/` as Functions.
6. **Note the hostname**: `https://kinetech-pages-proxy.pages.dev`.

## Verifying it works

```bash
# 1. The proxy reaches the Worker (booleans/counts only — no secrets)
curl -s "https://kinetech-pages-proxy.pages.dev/health?verbose=1"

# 2. A media route answers (a malformed token must be a clean 401 JSON)
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://kinetech-pages-proxy.pages.dev/v?t=bad"

# 3. A real stream (token minted by /api/play) must return 206
curl -s -D - -o /dev/null -H "Range: bytes=0-1023" \
  "https://kinetech-pages-proxy.pages.dev/v?t=<token>"
```

Expect `/v?t=bad` → **401** with `{"error":"unauthorized","reason":"bad_token_format"}`
and a real token → **206** with a correct `Content-Range`. If you get a
`proxy_misconfigured` body, `WORKER_ORIGIN` is missing or has a trailing slash.

## Switching the app to it

Once the proxy answers correctly, point the server at it — **Vercel → Settings →
Environment Variables**, set `VIDEO_STREAM_WORKER_URL` to
`https://kinetech-pages-proxy.pages.dev` (Preview first), then redeploy. The
Worker needs no change: it still sees the token and the forwarded `Origin`, and
`https://*.pages.dev` must be added to the Worker's `ALLOWED_ORIGINS` only if you
want pages.dev *pages* to call it directly (the proxy does not need it, since it
forwards the caller's own origin).

Rollback is one variable change: set `VIDEO_STREAM_WORKER_URL` back to the
`workers.dev` URL and redeploy.

## Free-plan limits

Pages Functions share the Workers free allowance: 100,000 requests/day and
10 ms CPU per request. This proxy does no work beyond a single `fetch` and a
streamed body, so it stays far inside that — but it does **not** halve anything
either: every proxied request is one Worker request *and* one Pages request.

## Known risks

- **Double hop.** Every media request now crosses Pages → Worker. A failure on
  either side surfaces as a player error; the chain falls forward to Direct →
  YouTube as usual.
- **`Cache-Control: private, no-store`** is set by the Worker for browser
  responses and forwarded untouched, so CDN/browser caching stays off. Chunk
  reuse is the Worker's job and remains unavailable on `workers.dev`.
- **The Worker's `ALLOWED_ORIGINS` still governs playback.** If a student's page
  origin is not listed, the proxy faithfully returns the Worker's 403.
- Not verified here: no Cloudflare access, so the deploy, the binding and every
  curl above are unverified from the agent's environment.
