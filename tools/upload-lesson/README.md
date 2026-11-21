# Upload a lesson to R2 (encrypted HLS)

Turns one mp4 into an encrypted HLS stream and puts it in the **private**
Cloudflare R2 bucket `kinetech`, ready for the Cloudflare Worker to serve.

```
node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>
```

(or `npm run lesson:upload -- --lesson <lessonId> --input <file.mp4>` from the repo root)

## What it does

1. **Encodes** with ffmpeg: one 720p H.264/AAC rendition (~1.5 Mbps), 10-second
   HLS segments, **AES-128 encrypted with a fresh random key per lesson**
   (and a random IV per lesson — ffmpeg writes one key line per playlist, so
   the segments of a lesson share that IV).
2. **Uploads** with the Cloudflare CLI — no S3 keys needed:
   `npx wrangler r2 object put kinetech/<key> --file <file> --remote`
   (`--remote` matters: without it wrangler writes to its local store).
3. **Reports** the uploaded size and warns when the bucket approaches the free
   tier limit (10 GB, warning at 8 GB).

## Layout in the bucket

```
lessons/<lessonId>/index.m3u8     the playlist
lessons/<lessonId>/seg/seg000.ts  the encrypted segments
keys/<lessonId>.key               the AES-128 key (private prefix)
```

The Worker rewrites the playlist on the way out so every segment AND the key
carry the playback token, and it serves the key **only** through
`/v/<lessonId>/key`.

## After uploading

Point the lesson at R2 (Supabase SQL editor):

```sql
update video_sources
   set source = 'r2', src_url = 'r2:<lessonId>'
 where video_id = '<lessonId>';
```

The `r2:` marker works even before the `source` column migration is applied.

## Safety

- The key is generated locally, **never printed**, and never committed — the
  working directory (`tools/upload-lesson/work/`) is git-ignored.
- The bucket stays **private**: no public r2.dev URL, no custom domain.
- Only the Worker serves the media, and only with a valid short-lived token.

## Honest scope

AES-128 HLS + a short-lived token + a device-bound request raise the cost of
copying and make a leak traceable. **This is not DRM and the video is not
"fully protected"** — a determined attacker with a screen recorder can still
capture it. Real Widevine/FairPlay DRM needs a paid provider.
