# Handoff — KineTech (owner view)

**Last updated:** 2026-11-24 · **Branch:** `feat/plan-v2-tasks` · **PR:** [#47](https://github.com/qhmed67/kinetech/pull/47) (open, **not merged**)

This is the short, current-status version of the project. The technical map
lives in [`docs/SYSTEM.md`](SYSTEM.md); the contracts live in
[`docs/PRODUCT-RULES.md`](PRODUCT-RULES.md) and
[`docs/USE-DOCUMENTATION.md`](USE-DOCUMENTATION.md).

---

## 1. What plays right now

| Tier | Status | Notes |
|---|---|---|
| **Worker (R2)** | ❌ **unavailable** | the worker `kinetech-video` (`backend/video-worker`) **does not exist on the Cloudflare account**. Nothing serves the R2 bucket. Guide: [`docs/R2-WORKER-SETUP.md`](R2-WORKER-SETUP.md) |
| **Worker (Drive prototype)** | ⏸ deployed but switched off | `kinetech-video-test` (`apps/worker-video`) is live with the owner's **test** Drive key. `app_settings.video_worker_enabled = { enabled: false }` keeps it out of the chain |
| **Direct Drive** | ✅ live | `app_settings.direct_drive_enabled = { enabled: true }`. It hands the page the Drive file id **and** the browser key (server-held, granted per request) — restrict that key in Google Cloud |
| **YouTube** | ✅ live | the last-resort tier (`youtube-nocookie` embed) |

So the effective chain today is **Direct Drive → YouTube**. The Worker hop
only comes back when the R2 worker is deployed **and** the flag is switched
on.

## 2. Settings that are live right now (`app_settings`)

| Key | Value | Effect |
|---|---|---|
| `video_worker_enabled` | `{ enabled: false }` | no Worker URL is ever returned |
| `direct_drive_enabled` | `{ enabled: true }` | the Direct tier grants the Drive id + key |
| `session_limits` | `{ mode: "log", max_concurrent_sessions: 2, max_concurrent_devices: 3, heartbeat_ttl_minutes: 30, ip_binding: false }` | over-limit accounts are **recorded**, never blocked |
| `stream_token_ttl_seconds` | `{ seconds: 3600 }` | how long a copied Worker stream URL keeps working (clamped 300…7200) |
| `native_gate` | `{ gate_enabled: true, min_supported_version: "0.0.0", force_update: false }` | **nobody is blocked** by the version gate |

## 3. Decisions taken (2026-11-24)

- `apps/web/vercel.json` — security headers, **no CSP**, `fullscreen=(self)`
  so the Plyr maximize button keeps working. ✅ applied (commit `2ca4526`)
- `.github/workflows/ci.yml` — `permissions: contents: read`, actions pinned
  to commit SHAs. ✅ applied (commit `2ca4526`)
- The hidden `#/player-test` page and its test are **removed**; the
  "the key is never part of the build" guarantee now lives in
  `apps/web/src/lib/clientEnv.test.ts` (source) **and** in
  `apps/web/scripts/check-bundle-secrets.cjs` (the build fails on a leak).
  ✅ applied (commit `4d47b3c`)
- `apps/web/src/lib/driveLinks.test.ts` **stays**: the core test does not
  cover the YouTube helpers nor the id validation (the case-by-case diff is
  in the commit message of `4d47b3c`).
- `apps/web/public/{signin,signup}.html` stay — `signin.html` is the live
  sign-in page (linked from `TopNav.tsx`, `Dashboard.tsx`, `Watch.tsx`).
- `apps/web/public/assets/vid.mp4` stays — used by `src/watch.ts:353` and
  `src/store.ts:216` as the local sample video.
- **No Expo downgrade** — the three moderate `npm audit` advisories stay
  (they need Expo 52.x, which would break the native app).

## 4. Open owner actions

| # | Action | Where |
|---|---|---|
| 1 | Deploy the R2 worker, then flip `video_worker_enabled` on | [`docs/R2-WORKER-SETUP.md`](R2-WORKER-SETUP.md) |
| 2 | Delete `VITE_DRIVE_BROWSER_KEY` from Vercel (Preview + Production) — nothing reads it | Vercel → Settings → Environment Variables |
| 3 | Restrict the Google API key: *API restrictions* = Drive API only, *Application restrictions* = HTTP referrers (`kinetechtest.vercel.app` + the worker origin) | Google Cloud Console → APIs & Services → Credentials |
| 4 | Decide about open self-signup (`disable_signup: false`) — a new account resets the 3-view cap | Supabase → Authentication → Providers → Email |
| 5 | Delete the Drive prototype worker `kinetech-video-test` once the R2 worker works (it holds a test Drive key) | Cloudflare dashboard |
| 6 | Rotate the Supabase management PAT that lives in the local session file | the local `session-*.md` file (git-ignored, never committed) |

## 5. Invariants that must not break

1. A playable URL never reaches the DOM, the WebView, the logs or
   localStorage — the player only renders what `/api/play` granted.
2. `/api/play` is the only way to a watchable URL.
3. Every new rule **fails open**: a missing row, a broken value or a DB
   outage must not lock a student out (the play *gate* is the exception: it
   must reach the DB).
4. The watermark rides on every tier.
5. `import.meta.env` may only ever expose the three public Supabase
   variables — the build now enforces it
   (`postbuild` → `check-bundle-secrets.cjs`).
6. The session limits stay in `mode: "log"` until the numbers look sane.
7. The version gate stays fail-open (`min_supported_version "0.0.0"`).

## 6. Verify after any change

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"   # Node 24
npm run test:unit          # 317 web + 7 + 6 + 13 + 80
npm run build              # includes the bundle-secret guard
npm run lint
bash scripts/verify.sh full
npm run logs -- --source db --level error --since 1h
```
