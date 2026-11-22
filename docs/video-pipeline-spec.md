# Video pipeline spec — Worker-streamed lessons

Owner-facing spec for publishing a lesson so the player can stream it through
the `kinetech-video-test` Worker, with automatic fallback to the Drive preview
and then YouTube. Nothing here changes the existing Drive-only lessons: a
lesson with no Drive file keeps playing exactly as before.

> **Honest limits.** A signed Worker token replaces the raw Drive URL in the
> player, so the Drive file id never appears in a URL, the DOM, or
> localStorage. It does **not** stop screen recording, and the YouTube id is
> visible in devtools once the YouTube fallback tier activates. Real
> protection stays server-side: single session, enrolment, 3-view cap,
> rate/suspicion rules, watermarked identity.

---

## 1. What the pipeline does

```
admin pastes a Drive link
        │
        ▼
/api/play (JWT + entitlement + view count)
        │  mode:"worker", src: https://<worker>/v?t=<signed token>
        ▼
<video> + Plyr  ──error/quota/stall──►  Drive preview iframe (same grant)
        │                                      │
        │                                      └─stall──► /api/play fallback=youtube
        ▼
Cloudflare Worker ──► Google Drive (Range requests, chunk cache)
```

* **Worker tier** (first): a real `<video>` element fed by the Worker. The
  token carries `{ v, uid, efid: { iv, ct }, exp, jti }` (HMAC-SHA256, 60
  min). The Drive file id is inside the token **encrypted** — AES-GCM-256,
  key = HKDF-SHA256 of `STREAM_TOKEN_SECRET` (fixed salt/info, random
  12-byte IV, authenticated). It never appears in the URL, the DOM or
  localStorage. Legacy v1 tokens (`fid` in the clear) still verify.
* **Drive tier**: the existing sandboxed Drive preview iframe, using the
  `embedUrl` returned by the *same* `/api/play` grant — switching tiers never
  burns another view.
* **YouTube tier**: requested only after the earlier tiers fail, via a separate
  `/api/play` call with `{ fallback: "youtube" }`. That call is read-only
  (no view counted) and returns the `youtube-nocookie.com` embed.

---

## 2. Publishing a lesson

### 2.1 Encode the file

Target: **MP4 / H.264 High / yuv420p, AAC-LC stereo 128 kbps 48 kHz, 720p max,
≤ 30 fps, `+faststart`, ~2 s keyframes, even dimensions.**

Standard 720p encode (CRF 23, preset slow):

```bash
ffmpeg -i input.mov \
  -vf "scale=-2:720:flags=lanczos,fps=30" \
  -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -crf 23 -preset slow \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart \
  output.mp4
```

* `scale=-2:720` keeps the aspect ratio and forces an **even** width.
* `-g 60 -keyint_min 60 -sc_threshold 0` at 30 fps = a keyframe every ~2 s.
* `-movflags +faststart` moves the `moov` atom to the front so playback starts
  before the whole file downloads.

1080p variant: replace `scale=-2:720` with `scale=-2:1080` (and
`-level 4.1`).

Size-capped two-pass encode (example: 500 MB target):

```bash
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 input.mov)
TARGET_MB=500
VBITR=$(awk -v mb="$TARGET_MB" -v d="$DUR" 'BEGIN{printf "%d", (mb*8192/d)-128}')

# pass 1
ffmpeg -y -i input.mov -vf "scale=-2:720,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -b:v "${VBITR}k" -preset slow \
  -g 60 -keyint_min 60 -sc_threshold 0 -pass 1 -an -f mp4 /dev/null

# pass 2
ffmpeg -i input.mov -vf "scale=-2:720,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -b:v "${VBITR}k" -preset slow \
  -g 60 -keyint_min 60 -sc_threshold 0 -pass 2 \
  -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart output.mp4
```

`VBITR` is the total bitrate budget minus the 128 kbps audio; it is clamped by
content complexity, so verify the output size with `ffprobe` afterwards.

Add `+faststart` to an already-encoded file **without re-encoding**:

```bash
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4
```

### 2.2 Verify with ffprobe

```bash
ffprobe -v error \
  -show_entries stream=index,codec_name,profile,pix_fmt,width,height,r_frame_rate,bit_rate \
  -show_entries format=format_name,duration,size,bit_rate \
  -of json output.mp4
```

Checklist:

| Field | Expected |
|---|---|
| `codec_name` (video) | `h264` |
| `profile` | `High` |
| `pix_fmt` | `yuv420p` |
| `width` / `height` | even; height ≤ 720 (or 1080 if chosen) |
| `r_frame_rate` | ≤ `30/1` |
| `codec_name` (audio) | `aac`, stereo, 48 kHz |
| `format_name` | `mov,mp4,m4a,3gp,3g2,mj2` |
| `size` | within your budget |

Faststart check (the `moov` box must appear **before** `mdat`):

```bash
ffprobe -v trace -i output.mp4 2>&1 \
  | grep -E "type:'(ftyp|moov|mdat)'" | head
```

If `mdat` appears first, re-run the remux command above.

### 2.3 Upload to Google Drive

1. Upload `output.mp4`.
2. Share: **Anyone with the link → Viewer** (API-key mode needs this).
   Download can stay **off** — the Worker only needs read access.
3. The file must be `video/mp4`. A `.mov` keeps `video/quicktime` and will
   trigger the "not an MP4" warning in the admin editor.
4. For **private** files, use a service account instead (§3.2) and share the
   folder with the service-account `client_email`.

### 2.4 Optional YouTube fallback

Upload the same file to YouTube (Unlisted is fine; embedding must be enabled),
then paste the link or the 11-character id into **YouTube fallback** in the
course editor. This tier is used only when the Worker and Drive tiers fail.

### 2.5 Fill the admin fields

Course editor → lesson → **Video URL**: paste the Drive share link. All of
these resolve to the same file id:

```
https://drive.google.com/file/d/<ID>/view?usp=sharing
https://drive.google.com/open?id=<ID>
https://drive.google.com/uc?id=<ID>&export=download
https://drive.google.com/uc?export=download&id=<ID>
```

The editor extracts the id, shows **Drive file detected**, and **Validate
file** asks the admin-only endpoint for the MIME type, size, and faststart
hint. A warning is informational only — the player still falls back to Drive
and YouTube. Save the course as usual; the ids are written with the rest of the
lesson.

> An **empty Drive link** leaves the lesson on the existing Drive/YouTube
> embed path — nothing changes for that lesson.

---

## 3. One-time setup

### 3.1 Google API key (viewer-shared files)

1. Google Cloud Console → create/select a project → enable **Google Drive API**.
2. **APIs & Services → Credentials → Create credentials → API key**.
3. Restrict the key to the Drive API (and optionally to your server IPs).
4. Set it in Vercel as `GOOGLE_API_KEY` (used by `/api/admin/video-meta` and
   `/api/drive-minutes`).

### 3.2 Service account (private files, optional)

1. Create a service account and a JSON key.
2. Share the Drive folder with the service account's `client_email` (Viewer).
3. Put the JSON inline in the Worker's `DRIVE_CREDENTIALS` (see §3.4). The
   Worker signs a JWT with the key and caches the access token until shortly
   before expiry.

### 3.3 Worker secrets

From the repo root:

```bash
npx wrangler secret put STREAM_TOKEN_SECRET --config apps/worker-video/wrangler.toml
npx wrangler secret put DRIVE_CREDENTIALS   --config apps/worker-video/wrangler.toml
npx wrangler secret put ALLOWED_ORIGINS     --config apps/worker-video/wrangler.toml
```

* `STREAM_TOKEN_SECRET` — a long random string. **The same value must be set in
  Vercel** (the server signs, the Worker verifies).
* `DRIVE_CREDENTIALS` — a JSON array, round-robin with one retry on
  403/429/401:

  ```json
  [
    { "type": "apikey", "key": "AIza..." },
    { "type": "service_account", "json": { "client_email": "sa@project.iam.gserviceaccount.com", "private_key": "-----BEGIN PRIVATE KEY-----\n...", "token_uri": "https://oauth2.googleapis.com/token" } }
  ]
  ```

  `service_account.json` may also be the JSON **string** of the key file.
* `ALLOWED_ORIGINS` — comma-separated exact origins or `*` patterns:

  ```
  https://kinetechtest.vercel.app,https://*.vercel.app
  ```

  Requests with no `Origin`/`Referer` (media elements are no-cors) are allowed;
  the token is the real gate.

Optional: `CHUNK_BYTES` (default `4194304`, i.e. 4 MiB; clamped 64 KiB–16 MiB).

### 3.4 Deploy the Worker

```bash
npx wrangler deploy --config apps/worker-video/wrangler.toml
```

The Worker name is `kinetech-video-test`; the URL is
`https://kinetech-video-test.<account>.workers.dev`.

### 3.5 Vercel environment variables

Set these on the project (Preview and Production as appropriate) and redeploy:

| Name | Value |
|---|---|
| `STREAM_TOKEN_SECRET` | same secret as the Worker |
| `VIDEO_STREAM_WORKER_URL` | `https://kinetech-video-test.<account>.workers.dev` |
| `GOOGLE_API_KEY` | Drive API key (§3.1) |

Until both `STREAM_TOKEN_SECRET` and `VIDEO_STREAM_WORKER_URL` are present,
`/api/play` returns `mode:"embed"` and lessons keep the existing Drive player.

### 3.6 Custom domain (optional, recommended)

Cloudflare dashboard → Workers → `kinetech-video-test` → **Settings → Domains
& Routes → Add custom domain**. A custom domain is the only way the Cache API
persists; on `*.workers.dev` the Worker probes the cache once per isolate and
then serves exact ranges straight from Drive. After adding it:

* update `VIDEO_STREAM_WORKER_URL` in Vercel,
* add the new origin to `ALLOWED_ORIGINS`,
* redeploy the Worker and Vercel.

---

## 4. Database migration (additive, nullable)

File: `supabase/migrations/20261122_video_stream_fallbacks.sql`.

Adds two nullable columns and two admin-only RPCs:

* `videos.drive_file_id text` — the streamed Drive file (null = legacy embed)
* `videos.youtube_video_id text` — optional last-resort fallback
* `admin_set_video_fallbacks(p_video, p_drive, p_youtube)` — validates opaque
  ids (rejects URL syntax)
* `admin_video_streams(p_slug)` — hydrates the two fields in the editor

**Apply it in the Supabase dashboard → SQL Editor → paste → Run.** Do not apply
it from the app. It is safe on a shared database: no data is rewritten, no
column is dropped. Until it is applied the app works unchanged — the server
derives the Drive id from `video_sources.src_url` and the editor fields stay
blank.

---

## 5. Worker behaviour

| Concern | Behaviour |
|---|---|
| Routes | `GET|HEAD /v?t=…`, `GET /meta?t=…`, `GET /health`, `OPTIONS *` |
| Auth | HMAC-SHA256 token verified with WebCrypto (`crypto.subtle.verify`, constant-time) on every request; `exp` enforced |
| Token | `{ v, uid, efid: { iv, ct }, exp, jti }`, base64url, TTL 60 min — `efid` = the Drive id AES-GCM-encrypted (HKDF-derived key); legacy v1 `{ v:1, uid, fid, exp, jti }` accepted |
| CORS | `ALLOWED_ORIGINS` exact/`*` match on `Origin`, else `Referer` origin; no-origin allowed |
| Drive call | `GET files/{id}?alt=media&supportsAllDrives=true` with `Range` |
| Ranges | 206 with `Content-Range`; 416 for malformed/unsatisfiable/multi-range; `bytes=-N` keeps last-N semantics; one response is capped to a single aligned chunk (4 MiB by default, `CHUNK_BYTES`-tunable) |
| Cache | aligned 4 MiB chunks keyed by **file id + chunk index** (never the token); in-isolate in-flight dedupe |
| Cache unavailable | probe once per isolate; then serve the exact requested range from Drive (no wasted chunk fetches), log `cache:"unavailable"` |
| Credentials | round-robin; one retry with the next credential on 403/429/401 |
| Quota | `503 {"error":"quota"}` + `Retry-After: 30` |
| Counters | structured log line: `drive_fetches`, `cache_hits`, `cache_misses`, `quota_errors`, `bytes_served`, `cache`, `jti`/`fid` **prefixes only**, `origin`, `ms` |

No token, full Drive id, or URL is ever logged.

---

## 6. Free-plan limits and rough costs

Cloudflare Workers **Free** (verify in the dashboard):

* 100,000 requests/day
* 10 ms CPU per request
* 128 MB memory per isolate
* 50 subrequests per request
* 6 simultaneous outgoing connections

Each media request makes ~1 metadata subrequest (cached per file for an hour)
plus 1–2 Drive range subrequests. A 4 MiB response keeps CPU low; a whole-file
response would not fit the 10 ms budget, which is why responses are capped.

Google Drive API has a free daily quota (see the Cloud console; an API key
alone does not bill). Watch `quota_errors` in the Worker logs.

Rough sizes (H.264 High, CRF 23):

| Quality | Bitrate | Per hour |
|---|---|---|
| 720p | ~1.2–2.0 Mbps | ~0.5–0.9 GB |
| 1080p | ~3–5 Mbps | ~1.3–2.3 GB |

Per-student estimate: 10 lessons × 0.7 GB ≈ **7 GB** if each is watched once;
seeks and re-watches push it toward 1.5–2×. On `*.workers.dev` every seek
re-fetches from Drive (no cache); a custom domain lets the chunk cache absorb
repeats.

---

## 7. Verification and known gaps

* **Automated:** `npm run test:unit` covers token sign/verify (valid, expired,
  tampered, wrong secret, shared test vector across all copies), range parsing
  and chunk math (open-ended, suffix, beyond-EOF, multi-range), 206/416
  headers, Drive-link extraction, credential round-robin/fallback, and the
  cache-unavailable fail-safe.
* **Not verifiable from this environment:** the actual Vercel preview deploy,
  the Cloudflare Worker deploy, and on-device behaviour (Path A vs Path B,
  rotation, fallback) — no Vercel/Cloudflare credentials and no device here.
  Run `npx wrangler tail --config apps/worker-video/wrangler.toml` and
  `GET /health` after deploying to confirm `cache:"available"` or
  `"unavailable"`.
* **CPU:** 4 MiB copies may approach the free 10 ms budget under load; watch
  the Worker CPU metrics and lower `CHUNK_BYTES` if needed.
* **YouTube id visibility:** once the YouTube tier activates, the id is in the
  embed URL and devtools. That is an accepted, documented trade-off.
