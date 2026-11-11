# Product rules — read before touching student-facing code

This site is an academy for STUDENTS: courses with watch-gated video parts,
exams/assignments per part, a dashboard (progress, lessons widget, bell),
plus an admin panel. Students are the protected party; every rule below
exists because breaking it once leaked or confused them.

## NEVER rules (security invariants — no exceptions, no "just this once")

1. NEVER render a raw video URL anywhere a student can see it: no buttons,
   no links, no text, no hints, no error messages, no tooltips, no titles.
   No "open in Drive", no "copy link", no pasting URLs into visible elements.
   A previous agent added exactly such a button with the real URL — that
   singlehandedly defeated the entire protection model. Never again.
2. The player gets its URL from ONE place only: the POST /api/play response
   (`embedUrl`). No other component may fetch, build, store for display, or
   link to a playable URL. Raw links live in admin form state while editing
   and die there.
3. Watermark (email • phone) floats over EVERY playback mode, always
   pointer-events-none, always drifting. Fullscreen included.
4. Playback requires: signed in + enrolled + views remaining. No previews,
   no samples, no backdoors for logged-out visitors.

## Video sources (the physics both sides accept)

5. Drive files are viewer-only, anyone-with-the-link, download OFF — and stay
   that way. They play ONLY inside Google's sandboxed preview frame, which we
   cannot style, script, or fix. Our chrome around it: watermark, poster,
   fullscreen escape, hints. Nothing more, ever.
6. Because of (5), Drive durations come from the server probe
   (`POST /api/drive-minutes`), never the browser. If it fails, ONE manual
   minutes box appears as fallback — auto-first always.
7. YouTube links play in the guarded custom player (no native chrome).
   Direct mp4 exists only for bundled seed assets.
7a. **R2 lessons (new, 2026-11-12).** A lesson may live in the private
   Cloudflare R2 bucket `kinetech` as AES-128 encrypted HLS. It is served
   ONLY by the Cloudflare Worker (`backend/video-worker`), and only with a
   short-lived HMAC token bound to that lesson, that user and that device
   (`POST /api/playback/start` issues it, `POST /api/playback/refresh` renews
   it without burning a view). Rules that follow from that:
     - the bucket stays PRIVATE — no public r2.dev URL, no custom domain, ever;
     - the media URL lives in the NATIVE app only: it never reaches the
       WebView, a log line, a student-facing string or the database UI;
     - the key file (`keys/<lessonId>.key`) is served by ONE route and no
       other; the playlist is rewritten on the way out so every segment and
       the key carry the token;
     - the identity watermark still floats over every playback mode (rule 3),
       including the native player;
     - Drive stays the FALLBACK source: rules (5) and (6) are unchanged.
   Honest scope: AES-128 + a signed URL + a device-bound token raise the
   cost of copying and make a leak traceable. This is NOT DRM. Never claim
   the video is "fully protected".

## Minutes

8. Paste link → auto-measure (server for Drive, hidden probe for YouTube) →
   field fills itself. Manual entry ONLY when auto fails three times.
   Student playback also corrects durations silently.

## Progress, completion, restarts

9. Completion = video END, seek-to-end included, by explicit owner decision.
   Do not reintroduce watch-percentage gates.
10. UNLOCK CHAIN (owner rule 2026-10-17): starting part N (playback begins,
    ~3s in) opens part N+1 — sticky forever. Older completions still count;
    the done flag (80%/end watch) no longer gates unlocking, but remains the
    progress signal (rule 10 second half unchanged).
11. Progress derives from PARTS (done flags), never view totals. A restart
    clears the part (views + done) so progress follows automatically.
12. View count: every mount burns one server-side view (3 max); a ~90s
    duplicate guard absorbs double-fires only. Never burn or unburn locally.

## Notifications

12. New-lesson notices go to the Upcoming Sessions widget ONLY — never the
    general notifications table.
13. Bell = ONE merged list, newest-first, top 3 (preview, not a center).
    Widget = newest-first, top 5. Same rows, no duplicates, both surfaces.

## Exams

14. Students never receive answer keys: questions arrive keyless, scoring
    happens server-side, review marks correct options ONLY for graded/final
    attempts. Pending attempts may resubmit freely — and see no keys.
15. Exams surface only for unlocked lessons. Admin builds with keys, grades
    writing, all through admin RPCs — never direct table writes.

## Admin UX contracts

16. Every save says what happened: synced + how many new videos + how many
    students notified — or the exact database reason in red + retry.
    Never show "saved" for something that didn't land.
17. Course editor: one open part at a time (accordion), unsaved typing is
    NEVER overwritten by background refreshes, blank rows prune on save.
18. A diagnostics card lives on the admin dashboard: build hash, session,
    RPC presence, per-course local-vs-DB counts, /api reachability. When
    something looks wrong, run it and read it before changing code.

## State rules

19. The database is the ONLY source of truth. Browser storage is a paint
    mirror for instant load + offline survival — except queued failed saves,
    which expire. Nothing local may ever override the server.
20. Grants/revokes apply on every navigation (no re-login needed); a stale
    gate shows "no access + retry", never a blank page.

## File map (behavioral, no DB internals)

- `src/components/ProtectedVideoPlayer.tsx` — the ONLY player. Three modes:
  YouTube custom chrome / Drive sandboxed preview / native mp4.
- `src/pages/Watch.tsx` — lesson page: unlock/limit/empty/session panels,
  exam modal entry, sidebar.
- `src/pages/Dashboard.tsx` — overview cards, sessions widget, exam tabs.
- `src/components/TopNav.tsx` — bell (merged feed + badge).
- `src/admin/CourseForm.tsx` — course editor. `src/admin/UsersManager.tsx`
  — enrollments, resets, notice test. `src/admin/AdminApp.tsx` — dashboard
  incl. diagnostics.
- `api/play.ts`, `api/session-register.ts`, `api/drive-minutes.ts` — the
  only server endpoints the client may call.
- Copy lives in `src/i18n.ts` (en + ar, always both).
