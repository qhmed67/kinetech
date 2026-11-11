# KineTech video Worker (Cloudflare)

The only door to the **private** R2 bucket that holds the encrypted HLS
lessons. The web app never sees a media URL; the native app gets a
short-lived, device-bound token and pulls the media from here.

```
GET /v/:lessonId/index.m3u8?t=TOKEN   the playlist (rewritten: every URI carries the token)
GET /v/:lessonId/seg/:file?t=TOKEN    one encrypted segment (supports Range)
GET /v/:lessonId/key?t=TOKEN          the AES-128 key for that lesson
```

## Setup (one time)

```bash
cd backend/video-worker
npx wrangler login
npx wrangler secret put GRANT_SECRET      # type a long random value
npx wrangler deploy                       # prints the Worker URL
```

Then add **both** values in Vercel (Project → Settings → Environment Variables):

| Vercel variable        | value                                        |
|------------------------|----------------------------------------------|
| `VIDEO_WORKER_URL`     | the URL printed by `wrangler deploy`         |
| `PLAYBACK_GRANT_SECRET`| **the same value** you typed into the Worker |

The server signs the playback tokens; the Worker verifies them. Same secret on
both sides, never in the repo.

## How a lesson is served

1. The app asks `POST /api/playback/start` (server gate: signed in + enrolled
   + views remaining + single session).
2. The server signs a token: `{ lessonId, userId, deviceId, expiry }` (2h) and
   returns the Worker playlist URL with that token attached.
3. The Worker verifies the token (signature, expiry, lesson match) and serves
   the playlist — rewriting every segment URI and the key URI so they carry the
   same token.
4. The key file lives under the private `keys/` prefix and is served by ONE
   route only.

## Upload a lesson

```bash
# from the repo root
node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>
```

See `tools/upload-lesson/README.md`.

## Free tier — what it costs

| Limit | Free allowance | What it means here |
|---|---|---|
| R2 storage | 10 GB | ~1 hour of video at 1.5 Mbps ≈ 675 MB → roughly 14 hours of lessons |
| R2 writes | 1M / month | one lesson upload = ~360 segment writes → ~2,700 lesson uploads/month |
| R2 reads | 10M / month | one watched hour = ~360 segment reads → ~27,000 watched hours/month |
| Workers requests | 100,000 / day | one watched hour = ~362 requests → **~275 fully watched hours per day** |

The request count is the binding constraint, not the storage. Keep the segment
length at 10s (already) and **turn on Cloudflare usage notifications** so you
see the daily quota before it bites.

## Honest scope

AES-128 HLS + a short-lived signed URL + a device-bound token raise the cost
of copying and make a leak traceable. **This is not DRM.** A screen recorder
still records the screen. Real Widevine/FairPlay DRM needs a paid provider
(VdoCipher / Bunny Stream / Mux) and re-encoded streams; the contract here is
provider-neutral so that can be swapped in without changing the app.

## Local development

```bash
cd backend/video-worker
echo "GRANT_SECRET=local-secret" > .dev.vars   # git-ignored
npx wrangler dev                                # local R2 (miniflare)
```

Unit tests (no Cloudflare account needed):

```bash
npm run test --workspace=backend/video-worker
```
