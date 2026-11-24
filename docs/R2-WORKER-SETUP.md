# R2 Worker setup — click-by-click

**Status: NOT EXECUTED.** This guide is preparation only; nothing in it has
been run against the account. Every command is written so you can copy it
as-is. Decide when to run it — the deployment is one command, but the
secrets and the two Vercel scopes are yours to set.

**Why:** the R2 worker `kinetech-video` (source: `backend/video-worker`)
**does not exist on the Cloudflare account** today
(`npx wrangler deployments list --config backend/video-worker/wrangler.toml`
→ `This Worker does not exist on your account [code: 10007]`). Until it
exists, the native/R2 playback path cannot play and `video_worker_enabled`
stays `false`.

**What it buys you:** the Worker tier becomes the first hop of the chain
(Worker → Direct Drive → YouTube), the student never receives a Drive file
id, and the lesson bytes are served from the private R2 bucket through a
short-lived, device-bound token.

---

## 0. Before you start

| Need | Check | How |
|---|---|---|
| Cloudflare login | the account with the R2 bucket | `npx wrangler whoami` → account `27dd9d0c72cc45352371255e2e64c09b` |
| ffmpeg (local) | for the HLS encode | `ffmpeg -version` |
| A source mp4 | one lesson file | the Drive file you want to move to R2 |
| The lesson id | the `videos.id` uuid in Supabase | `select id, title from videos;` |
| Both worker secrets | they must be **identical** on both sides | `openssl rand -hex 32` (run ONCE, keep it) |

> Free tiers: Cloudflare Workers 100 000 requests/day, R2 10 GB stored,
> Vercel functions (Hobby). Everything below stays inside them.

---

## 1. Create the R2 bucket (once)

```bash
npx wrangler r2 bucket create kinetech
npx wrangler r2 bucket list          # expect "kinetech"
```

> The bucket must stay **private**: no `r2.dev` public URL, no custom
> domain. Only the Worker reads it.

## 2. Deploy the worker

```bash
npx wrangler deploy --config backend/video-worker/wrangler.toml
npx wrangler deployments list --config backend/video-worker/wrangler.toml
```

Expected: a deployment line for `kinetech-video` (the name comes from
`backend/video-worker/wrangler.toml`). The worker URL looks like
`https://kinetech-video.<your-subdomain>.workers.dev`.

Check the free-tier route of the worker:

```bash
curl -s https://kinetech-video.<your-subdomain>.workers.dev/health
```

## 3. Set the shared secret (once)

```bash
# GENERATE ONCE — the same value must exist in Vercel AND in the Worker.
openssl rand -hex 32

npx wrangler secret put GRANT_SECRET --config backend/video-worker/wrangler.toml
```

Paste the same value when prompted. Then list the secret **names** (the
values are never displayed):

```bash
npx wrangler secret list --config backend/video-worker/wrangler.toml
# expect: GRANT_SECRET
```

> The worker accepts `GRANT_SECRET_PREV` as an optional second secret so
> tokens signed before a rotation keep working for a while.

## 4. Point the app at the worker (Vercel)

Add the env var in **both** scopes:

| Name | Value | Scope |
|---|---|---|
| `VIDEO_WORKER_BASE_URL` | `https://kinetech-video.<your-subdomain>.workers.dev` | **Preview** and **Production** |

Steps: Vercel → the project `kinetechtest` → Settings → Environment
Variables → add → pick the scope(s) → Save. **An env change needs a
redeploy** — Vercel redeploys Preview automatically; for Production, deploy
the merged commit.

> `VIDEO_WORKER_BASE_URL` is the **native/R2** stack (`api/playback/start.ts`,
> `api/playback/refresh.ts`). Do NOT confuse it with
> `VIDEO_STREAM_WORKER_URL` — that one belongs to the old Drive prototype
> worker and is not part of this guide.

## 5. Put one lesson in R2

```bash
node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>
# or: npm run lesson:upload -- --lesson <lessonId> --input <file.mp4>
```

The tool encodes 720p HLS with **AES-128** (a fresh random key per lesson,
never printed, never committed), splits it into 10-second segments and
uploads them with `--remote`. In the bucket:

```
lessons/<lessonId>/index.m3u8
lessons/<lessonId>/seg/seg000.ts …
keys/<lessonId>.key
```

Point the lesson at R2 (Supabase → SQL editor):

```sql
update video_sources
   set source = 'r2', src_url = 'r2:<lessonId>'
 where video_id = '<lessonId>';
```

## 6. Verify before switching the flag on

```bash
# a) the worker is alive
curl -s https://kinetech-video.<your-subdomain>.workers.dev/health

# b) it refuses a request without a token (must NOT return media bytes)
curl -s -o /dev/null -w "%{http_code}\n" "https://kinetech-video.<your-subdomain>.workers.dev/v?t=bogus"
# expect 401/403

# c) live logs while you play the lesson in the app
npx wrangler tail --config backend/video-worker/wrangler.toml
```

Then, in the app (native app or web): open the lesson and check that

- the player shows the **Worker** tier (the admin panel prints the tier
  history; the debug strip shows the stream host),
- the request to the worker carries `?t=…` and no Drive file id appears
  anywhere in the URL or the DOM,
- seeking works (Range → 206 + `Content-Range`).

## 7. Switch the tier on (admin)

Admin dashboard → Settings → the Worker streaming toggle → confirm. The
server re-reads the flag within 20 seconds (cached), and the change is
written to `app_settings_audit`.

Check it landed:

```sql
select key, value, updated_at from app_settings where key = 'video_worker_enabled';
```

Result: `{ "enabled": true }`.

## 8. Rollback (if something breaks)

Fastest: switch the toggle **off** again in the admin dashboard. The tier
chain then falls back to Direct Drive → YouTube within 20 seconds, no
redeploy needed.

If the worker itself must go:

```bash
npx wrangler delete kinetech-video      # asks for confirmation
```

Keep the bucket (the lessons stay); only the worker is removed.

---

## Notes and traps

- **Two worker stacks exist.** `kinetech-video` (this guide, R2) and
  `kinetech-video-test` (the old Drive prototype in `apps/worker-video`).
  Their secrets are different: `GRANT_SECRET` vs
  `STREAM_TOKEN_SECRET` / `DRIVE_CREDENTIALS`. Never mix them.
- **Do not** add a `r2.dev` public URL or a custom domain to the bucket.
- **Do not** set `VITE_DRIVE_BROWSER_KEY` (or any other `VITE_` var) to work
  around a problem — a `VITE_*` variable is inlined into the public bundle,
  and the build now **fails** if a key-shaped string reaches `dist/`
  (`apps/web/scripts/check-bundle-secrets.cjs`).
- The Worker serves the AES key only through `/v/<lessonId>/key`, and only
  with a valid token.
- **Honest scope:** this is not DRM. A student who is allowed to watch can
  still screen-record; the token only makes a *copied URL* useless shortly
  after the copy.
- The prototype worker `kinetech-video-test` can be deleted once this guide
  is done and working (it holds a test Drive API key).
