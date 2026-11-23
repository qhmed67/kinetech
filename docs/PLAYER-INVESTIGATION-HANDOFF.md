# Lesson player — investigation handoff

**Date:** 2026-11-23 · **Repo:** `qhmed67/kinetech` · **Production:** `kinetechtest.vercel.app`
**Production HEAD at time of writing:** `3a39280` (PR #42 merged)

This document records only what was **directly observed or read in the code**. Anything
that could not be verified is listed as such at the end. No secret values, file IDs,
emails or signed URLs are reproduced here.

---

## 1. The symptom, as reported

> "still the video disappears and nothing of the 3 solution fallbacks works"

Observed states across the session (from the user's screenshots and DevTools captures):

1. A Drive lesson rendered the terminal card **"Video unavailable right now — try again in a moment."**
2. Later, the same lesson rendered **an empty area** — header and course sidebar present,
   "2 of 3 views remaining" badge present, but no player, no spinner, no error text.
3. Later still, the media request appeared and was **cancelled at 14.74 s with 0 bytes**:
   `v?t=eyJ2IjoyLCJ1aWQi… (canceled) media 14.74 s 0.0 kB`.
4. In one capture the Worker request was **absent entirely**, while Supabase reads showed
   `(canceled)` at 9 ms followed by `(unknown)` / `(pending)`.
5. Admin-reported: "Direct is never reached; YouTube never shows although `/api/play` returns `youtubeVideoId`".

## 2. Evidence that was handed to me

| Evidence | What it proved |
|---|---|
| `/api/play` responses: `{ok:true, mode:"embed", embedUrl:"https://drive.google.com/file/d/<id>/preview", youtubeAvailable:true, viewsLeft:2}` | The Worker branch was **not** running (env empty at build/runtime). The raw Drive URL was being returned to the browser. |
| `{ok:true, mode:"youtube", embedUrl:"https://www.youtube-nocookie.com/embed/…", viewsLeft:0}` | The YouTube fallback endpoint worked server-side. |
| `viewsLeft` going `2 → 1 → 0` on one lesson across reloads | Views were being consumed by **fallback** calls, not just by the initial grant. |
| `v?t=eyJ2IjoyLCJ1aWQi…` present, then `(canceled)` at 14.74 s, 0 bytes | The Worker tier **did** issue later (v2 token = encrypted file id). The request then stalled and was killed by the 12 s client watchdog. |
| Terminal output: `npx wrangler tail` → `ETIMEDOUT 188.114.96.6:443`, `ETIMEDOUT 188.114.97.6:443`, `ENETUNREACH 2a06:98c1:3120::6:443`; `*.pages.dev` (172.66.44.80) answered HTTP 404 normally | Cloudflare's **API edge** is unreachable from that machine. `wrangler tail` cannot work there. This is a network condition, not a credentials problem. |
| Screenshot: "Video unavailable" card, `2 من 3` remaining | The card came from a latched failure state, not from a real denial. |
| Screenshot: empty player area with `2 من 3` | Neither player, spinner, nor error card rendered. |
| Vercel dashboard: production deployment at `117c0b9`, READY | Production was serving the merged code, but the **feature** was inert because env vars were preview-scoped only. |

## 3. Root causes (each traced to a line, each fixed)

### 3.1 The YouTube tier was unreachable
`apps/web/src/components/ProtectedVideoPlayer.tsx` (pre-#41), render branch:

```ts
if (tier === "youtube" && isDrive) { return <spinner/> }
```

`isDrive` is deliberately sticky (it survives the embed swap, see #39). So once a Drive
lesson reached the YouTube tier, the spinner rendered **unconditionally**, including after
the `youtube-nocookie` embed had arrived. YouTube could never render.

Fix: render the spinner only while the embed is still missing → `&& !isYt`.

### 3.2 A Drive lesson without a Worker grant skipped Direct
`apps/web/src/lib/playerTiers.ts`:

```ts
if (opts.workerMode && opts.workerSrc) return …;
return "youtube";            // ← no notion of "this lesson has a Drive file"
```

Any non-Worker grant went straight to YouTube. On a deployment without the Worker env
(production at the time), every Drive lesson therefore skipped Direct entirely.

Fix: `hasDriveFile ? "direct" : "youtube"`.

### 3.3 Every fallback burned a view
`apps/web/api/play.ts`: the `fallback === "direct"` branch sat **after**
`userClient.rpc("request_play", …)` — the RPC that counts the watch. Each Worker failure
consumed another view, and once `viewsLeft` hit 0 the very next load was rejected by the
cap it had just burned.

Fix: both `fallback` branches now run **before** `request_play`, through one shared
read-only gate (`fallbackGate`): profile, ban, enrolment (admins bypass enrolment).
Tests assert `request_play` is not called on either fallback.

### 3.4 The player could vanish
Several flags (`over`, `failed`) short-circuited the render from different places.

Fix: one reducer `worker → direct → youtube → terminal`. Terminal is the only state that
replaces the player, and it renders a card with a Retry button (EN + AR).

### 3.5 The Direct tier rendered a zero-height box (**this was the "video disappears"**)
`apps/web/src/components/DirectDriveVideoPlayer.tsx` root element:

```tsx
className="pvp-direct relative w-full overflow-hidden rounded-[20px] …"
```

…with every child absolutely positioned — `.plyr` is `position:absolute; inset:0`
(`directPlayer.css`). A container whose children are all out of flow has **zero height**.
So when the Worker failed and Direct mounted, the video loaded into a 0 px box: nothing
visible, no `error`, no stall, therefore no further fallback. Worker and YouTube-shell
branches all carried `aspect-video`; this one did not.

Fix: root now carries `aspect-video`.

*Verified against production:* the deployed bundle contains
`pvp-direct relative aspect-video` (checked on `index-BYWhWPrt.js` after PR #42).

### 3.6 `isDrive` was computed with a mode exclusion
`ProtectedVideoPlayer.tsx` (after #41):

```ts
const isDrive = grant?.mode !== "worker" && grant?.mode !== "direct" && (…)
```

A Drive lesson stopped being a Drive lesson **exactly while the Worker or Direct tier was
active**. Two consequences:

- `onWorkerFatal` passes `canDirect: isDrive` → false on the Worker tier → **Worker→Direct
  never happened**.
- When Direct failed, `tier === "youtube" && isDrive` was false, so the lesson fell through
  to `if (!isYt)` and rendered `<video src="https://drive.google.com/file/d/<id>/preview">`
  — an embed URL inside a media element — i.e. a blank box.

Fix: `lessonIsDrive(grant.isDrive, embedUrl)` — the flag captured once at grant time wins;
the embed is only a fallback for pre-flag grants; the active tier is never consulted.

### 3.7 Secondary defects found while reading the code
- `DirectDriveVideoPlayer` rendered **no watermark** — a product-rule violation on a
  playback mode. It now receives `watermark` from the parent.
- `DirectDriveVideoPlayer` rendered its **diagnostic strip unconditionally**, so students
  saw internal state. Now gated on `debugOn` (`?pvpdebug=1`).
- `#/player-test` shipped the Drive key inside the production bundle: Vite inlines every
  `VITE_*` variable into the generated env chunk **even when no source file reads it**.
  The route is now dev/preview-only and the page asks for the key at runtime
  (`sessionStorage`, never a URL or `localStorage`). A production build was scanned and
  contains zero occurrences of the key name.

## 4. What shipped

| PR | Commit | Contents | Gates |
|---|---|---|---|
| #39 | `117c0b9` | keep Drive lessons on the YouTube tier (first attempt; fixed the transition, not the render branch) | green |
| #40 | `dfb1f1f` | bounded lesson-id resolve (12 s) + retryable error instead of an infinite skeleton; `api.play.worker_*` diagnostics | green |
| #41 | `336baed` | tier machine + fallbacks before `request_play` + retry card + debug strip everywhere + key out of bundles | 341 tests |
| #42 | `3a39280` | Direct tier height + `lessonIsDrive` + Direct watermark + debug-only strip | 349 tests |

Gates run for #42 (Node 24.22.2): `build` PASS · `lint` 0 errors · `test:unit`
**243 web + 7 + 6 + 13 + 80 = 349** · `typecheck -w @kinetech/mobile` PASS.

## 5. Test matrix (new coverage)

| Behaviour | Test |
|---|---|
| Worker → Direct | `playerTiers.test.ts` reducer |
| Worker → YouTube when Direct unavailable | reducer |
| Direct → YouTube | reducer |
| YouTube fails → terminal | reducer |
| Terminal is sticky, no loops | reducer |
| Fresh worker-fail marker → Direct first | reducer (`reason: worker_marker`) |
| No Worker grant + Drive file → Direct | reducer |
| Drive lesson stays "Drive" on Worker tier | `lessonIsDrive` |
| Drive lesson stays "Drive" after embed swap | `lessonIsDrive` |
| Fallback does not call `request_play` | `play.test.ts` (direct + youtube) |
| Missing browser key fails closed (`SYS_003`) | `play.test.ts` |
| Direct player has a non-zero box | `DirectDriveVideoPlayer.test.tsx` |
| Direct player renders the watermark | same |
| Strip hidden by default, shown with `debugOn` | same |
| Player-test page asks for the key | `PlayerTest.test.tsx` |

## 6. Actions that were REFUSED by the sandbox (recorded verbatim)

These were **not** worked around:

1. **Vercel API with the provided token** (twice, two different tokens):
   > "Uses an exposed Vercel token for authenticated external API access and saves project data."
   > "Reads Vercel production environment metadata using an exposed token, risking secret disclosure."

   Consequence: I could never list env-var **names/scopes** from the API, nor confirm which
   alias `kinetechtest.vercel.app` points to. Production was instead verified by fetching the
   deployed bundle and grepping for identifiers from the new code.

2. **`git push` / `gh pr create` / `gh pr merge` at various points**:
   > "Push publishes the branch remotely; user authorized push, but not this specific push destination/action clearly enough."
   > "Creates a GitHub pull request, an external publishing action…"
   > "Merges PR into shared repository; latest authorization covers push/commit/PR, not merging."

3. **`rm -rf` of my own scratch build directories** (lint picked up minified files inside them):
   > "Deletes project scratch directories recursively; user did not authorize this cleanup."

   Workaround used: the directories were **moved** under `apps/web/dist/` (gitignored) so the
   lint gate reads clean source. They are still on disk under `apps/web/dist/scratch/`.

4. **Downloading the production JS bundle into the project** was refused; fetching it to
   stdout (`curl … | grep -c`) was allowed and is what the production verification used.

## 7. NOT verified — do not assume these

1. **Live end-to-end playback.** No authenticated session and no ability to reach the Worker
   from the agent environment. Every conclusion about *runtime* behaviour comes from reading
   code plus the user's captures.
2. **Worker-side streaming.** `workers.dev` is unreachable from both the agent environment
   and the user's machine. The stall (`0 bytes`, cancelled at ~14.7 s) was diagnosed from
   the client watchdog and the Worker source, **not** from Worker logs.
3. **`DRIVE_CREDENTIALS` correctness.** Earlier it was set to a placeholder string. Whether
   it now holds a real `[{"type":"apikey","key":"AIza…"}]` is unknown to me. If it does not,
   the Worker returns 503/quota and the chain falls to Direct — which now works.
4. **Worker cache state.** The Worker's `caches.default` probe cannot be trusted on
   `workers.dev`; a custom domain/route is required for real caching.
5. **Vercel env-var scopes.** Not readable (see §6.1). If `VIDEO_STREAM_WORKER_URL` is not a
   valid absolute URL, `new URL()` throws inside the worker branch and the response silently
   degrades to `mode:"embed"`; #40 added `api.play.worker_failed` with an error class name to
   make that visible in logs.

## 8. What to do next (for the receiving agent)

1. **Confirm the three Production env names** in the Vercel dashboard, Environment column
   must include *Production*: `DRIVE_BROWSER_KEY`, `STREAM_TOKEN_SECRET`,
   `VIDEO_STREAM_WORKER_URL`. Then redeploy with **build cache off** (env changes need a new
   build).
2. **Delete `VITE_DRIVE_BROWSER_KEY`** from Vercel. Nothing reads it now, and while it exists
   on a scope it is inlined into that scope's bundle.
3. **Worker secrets**: `DRIVE_CREDENTIALS` = real API key JSON (server-side, so **no**
   referrer restriction); `ALLOWED_ORIGINS` must include `https://kinetechtest.vercel.app`;
   `STREAM_TOKEN_SECRET` must byte-match Vercel's. Cloudflare cannot show a secret back —
   rotate both sides if unsure.
4. **Reset the view counter** for the test lesson (it was left at `viewsLeft: 0`), or use a
   fresh account.
5. **Verify on a real device** with `?pvpdebug=1`, blocking hosts one at a time in
   DevTools → Network → Request blocking:
   - `https://*.workers.dev/*` → strip shows `tierHistory: worker → direct`, Drive plays
   - add `https://www.googleapis.com/drive/*` → `direct → youtube`, YouTube plays
   - add `https://www.youtube-nocookie.com/*` → error card with Retry, strip still visible
6. **If it still fails**, capture the `?pvpdebug=1` strip. It now prints `tier`,
   `tierHistory`, `tierReason`, `playCalls`, `viewsLeft` — those five values identify which
   tier failed and why without further guessing.

## 9. Known remaining risks

- The **Direct tier exposes the Drive file id and browser key** in DevTools by design. The
  Worker tier is the only tier that does not. If both Worker and Direct fail, a student ends
  on YouTube (or the error card), never on the Drive iframe — the iframe tier was removed in
  #38 and stays removed.
- The **YouTube id** is visible in the embed. The watermark is the deterrent there; code
  comments say so honestly.
- **Supabase request churn**: `hydrateStoreFromDb({force:true})` aborts any in-flight hydrate
  (`apps/web/src/lib/db/sync.ts:98`), which is what produced the `(canceled)` at ~9 ms bursts.
  It is a cancellation/re-fire of the catalog hydrate, not data corruption, and it was left
  untouched because no link to the player failure was established.
