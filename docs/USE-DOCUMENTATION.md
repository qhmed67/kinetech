# KineTech site — use documentation

Orientation for a fresh session: what this website IS, WHO uses it, HOW every
flow works, and WHICH logic you must never fight. Read this alongside
`AGENTS.md` and `docs/PRODUCT-RULES.md` (the behavioral contract — the rules
below defer to it on any conflict, and the incident at the end tells why).

This is a logic doc, not a task log: no change history, no DB schema details.
When code and this doc disagree, believe the code — then fix this doc.

## 1. What this site is

An academy for STUDENTS, run by one owner (the admin). Two halves:

- **Public/marketing half**: bilingual (Arabic-first) landing page for the
  KineTech brand — engineering & technology education (Python + data,
  robotics, SolidWorks) plus marketing/software/design services. Contact
  happens via WhatsApp; several public pages exist so visitors can browse
  before buying.
- **Student academy half**: signed-in students watch gated video parts,
  take exams/assignments per part, and track progress in a dashboard.
  Access is granted per course by the admin — nobody self-grants.

The student is the protected party. Every rule exists because breaking it
once leaked something (playable URLs) or confused students.

## 2. Users and roles

- **Visitor**: sees the public half only. Protected routes redirect to sign-in.
- **Student**: signed-in user (`role: "student"`). Watches only courses the
  admin granted (`enrolled: string[]` of slugs). Can be `banned`.
- **Admin** (`role: "admin"`): server-verified profile role. The admin panel
  is a separate routing area (`#/admin/...`) with its own login page.
  Every privileged action re-verifies server-side — the client role field
  is a hint, never a gate.

Student identity (`src/auth.ts`): name, email, phone (verified contact —
it feeds the video watermark), enrolled slugs, tracks, role, banned flag.
The local `kt-user` object is a mirror; the Supabase session is the truth.

## 3. Routing and pages (hash router, `src/router.ts`)

| Route | Page | Who | Purpose |
|---|---|---|---|
| `#/` (+ anchors `#/services`, `#/pillars`, `#/academy`, `#/contact`) | Landing (`Hero/Pillars/Services/Academy/Reviews/Contact`) | everyone | brand marketing |
| `#/courses` | `pages/Courses.tsx` | everyone | catalog (tech / other categories) |
| `#/courses/<slug>` | `pages/CourseDetail.tsx` | everyone | course page; lessons clickable when unlocked |
| `#/courses/<slug>/watch/<idx>` | `pages/Watch.tsx` | enrolled only | the player page |
| `#/baccalaureate` | `pages/Baccalaureate.tsx` | everyone | secondary-education track |
| `#/services/marketing·software·design` | `pages/ServicePage.tsx` | everyone | service pages with posts |
| `#/about`, `#/contact`, `#/privacy`, `#/terms` | static pages | everyone | |
| `#/dashboard/<tab>` | `pages/Dashboard.tsx` | students | progress, lessons, exams tabs, assignments |
| `#/admin/login` + `#/admin/<page>` | `admin/*` | admin | the panel (§7) |

Unknown slugs never 404 silently — `router` checks `courseExists(slug)` and
shows the not-found page. Navigation is hash-based: no page reloads, so
freshness chores (catalog hydrate, grant re-sync) hook the hashchange event.

## 4. The student watch flow (the heart of the product)

1. Student opens `#/courses/<slug>/watch/<idx>`. Parts unlock **sequentially**
   (part n+1 unlocks when part n completes; admin can see/adjust).
2. The player widget (`ProtectedVideoPlayer.tsx` — the ONLY player) first
   mints a grant: one `POST /api/play` per mount, with the student's JWT.
   The server (a) verifies the session is the only active one, (b) gates:
   signed in + enrolled + banned check, (c) counts ONE view (3 max per part),
   (d) returns `embedUrl` + minutes + watermark identity.
3. Playback renders per source type:
   - **YouTube**: guarded custom player (API-driven, zero native chrome,
     custom control bar, watermark, quality/speed controls).
   - **Google Drive**: Google's sandboxed `/preview` iframe, viewer-only.
     OUR chrome around it = watermark + poster + one fullscreen escape +
     dismissable hints. NOTHING more, ever (see §6 — this is the trap).
   - **mp4**: plain native video, only ever bundled seed assets.
4. Progress: completion = video END (seek-to-end included — owner decision,
   do "fix" it back). Views burn server-side; a ~90s duplicate guard absorbs
   double-mounts only. Progress = distinct parts done, never view totals.
   A restart clears the part (views + done) so everything recomputes.
5. Watch-state writes go local-first (instant UI) then push to Supabase
   RPCs that re-enforce caps/locks. The server hydrates over local state
   on load — local never overrides what the DB says when reachable.

Rate/abuse layers on `/api/play` (see `api/config.ts`, mirrored in
`api/play.ts` and the `request_play` RPC): burst limiter, distinct-minutes
suspicion window (flag → deny), distinct-IP flagging, single-session gate
(signing in on another device kills this one, the UI says so honestly).

## 5. Content model (courses) and where truth lives

- Courses/modules/parts/services live in the content store (`src/store.ts`),
  mirrored into localStorage for instant paint, hydrated from Supabase on
  every fresh tab load and every hash navigation (non-forced, 30s cooldown).
- Supabase is the ONLY source of truth when reachable. localStorage is a
  paint mirror — EXCEPT the pending-push outbox: admin saves that failed to
  reach the DB are queued by slug and protected from being overwritten by
  hydrate until they land or are dropped.
- Admin saves say what happened (rule 16 in PRODUCT-RULES): synced + how
  many new lessons + notified, or the exact DB error + retry. A "synced"
  save is re-read back from the DB right after (verify loop).
- Dual-language content everywhere: every text field is `{en, ar}`; the
  UI falls back to the non-empty language instead of rendering blanks.
  All UI copy lives in `src/i18n.ts` — ALWAYS add both languages.

## 6. THE lesson — video URLs are radioactive (why this doc exists)

A capable-looking agent once "improved" the player by adding a nice big
button labeled "Open in Drive · فتح في درايف" linking the REAL playable
URL — plus a fallback row of buttons around the player. That single change
defeated the entire protection model: any student could right-click → copy
the direct file link, share it, and all the session/view-cap/watermark
machinery guarded nothing. It shipped to production.

The iron laws (full list in PRODUCT-RULES §NEVER):

1. NEVER render a raw video URL anywhere a student can see — no buttons,
   links, text, hints, error messages, titles, tooltips. No "open in ...",
   no "copy link". The file being served THROUGH Google's hosted player is
   not even acknowledged in student-facing copy (our load-failure message
   says "check your connection", never "can't reach Drive").
2. The player gets its playable URL from exactly ONE place: the
   `POST /api/play` response. No other fetch, no building URLs client-side
   from admin text, no display/storage of gated URLs (the store actively
   strips gated URLs before persisting to localStorage).
3. Drive files stay viewer-only (anyone-with-link, download OFF) and play
   ONLY inside Google's preview frame. We cannot style/script/fix that
   frame — not its small play button on phones, not its desktop chrome.
   The accepted answer is: our own poster + hints + escape hatch, and
   "PC/Chrome best" guidance when needed. If that feels limited, the
   acceptable alternative the owner may choose is REPLACING the source
   (e.g. a proper video host with a signed embed) — never exposing the
   Drive file path.

Before touching ANYTHING student-facing on the player/admin/urls: re-read
PRODUCT-RULES.md. Slow down there. That file is a blocker, not advice.

## 7. The admin panel (`#/admin`, `src/admin/*`)

- Separate login (`AdminLogin.tsx`), `AdminShell` guards by server role.
- **Dashboard `AdminApp.tsx`**: overview + a diagnostics card (build hash,
  session, RPC presence, local-vs-DB counts, /api reachability). When
  anything looks wrong, run diagnostics and READ it before changing code.
- **CourseForm.tsx**: the editor. Contracts: one open part at a time
  (accordion); unsaved typing is NEVER overwritten by background refresh;
  blank rows prune on save; every save reports outcome honestly.
- **CoursesList.tsx** (catalog actions, incl. resets), **UsersManager.tsx**
  (enrollments/grants+revokes, view/progress resets, notices, ban),
  **Grading.tsx** (pending writing submissions, grade + review),
  **ExamBuilder.tsx** (per-part exams with answer keys — keys stay
  server/admin-side), **ServicesEditor.tsx** (service pages + posts).

## 8. Exams/assignments

- Each part may carry an exam and/or assignment. Students NEVER receive
  answer keys: questions arrive keyless, scoring happens server-side
  (RPCs), and review marks correct options ONLY for graded/final attempts.
  Pending attempts can resubmit freely; they see no keys.
- Exams surface only for unlocked lessons (the unlock chain applies).
- Admin grades writing in the panel via admin RPCs — never direct table
  writes from the client.

## 9. Notifications & sessions

- New-lesson notices go to the Upcoming Sessions widget ONLY — never the
  general notifications table.
- The bell = ONE merged list (newest-first, top 3 preview; the widget shows
  top 5). No duplicates across surfaces. Seen-state resets the badge.

## 10. Language, design, backend shape (facts you shouldn't rediscover)

- Bilingual EN/AR with RTL flip (`documentElement.dir`), persisted under
  `kt-lang`. Everywhere: `src/i18n.ts` holds ALL copy; add both sides.
- Design system: `DESIGN.md` is the source of truth — purple `#6E4E9C` +
  teal `#3BBCD9`, single-hue purple gradients, Alexandria (AR) / Valley Sans
  (EN) display type, light theme, Lucide/Tabler icons (no emoji).
- Backend: Vercel serverless functions in `/api` — `play.ts`,
  `session-register.ts`, `drive-minutes.ts`. They are SELF-CONTAINED files
  (no relative imports — Vercel's bundler breaks on them); keep that style.
  Database: Supabase Postgres behind RLS; client calls go through the thin
  wrappers in `src/lib/db/*`; migrations live in `supabase/migrations/`.
- Env var NAMES (never values in code/logs): client `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (legacy alias `VITE_SUPABASE_PUBLISHABLE_KEY`);
  server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  plus `GOOGLE_API_KEY` for Drive metadata. Deploys: Vercel builds from
  GitHub main; env changes need a redeploy.

## 11. Where the fine print lives

- `docs/PRODUCT-RULES.md` — the behavioral contract for student-facing code
  (player file map, rules 1–20). BLOCKING.
- `AGENTS.md` — engagement rules, verification definition, stable baseline
  tag, self-debugging protocol with request IDs.
- `docs/DECISIONS.md` — ADRs; re-read before opening a decided topic.
- `docs/TESTING.md`, `docs/LOGGING.md`, `docs/ARCHITECTURE.md`,
  `docs/ERROR-CODES.md`, `docs/CI-CD.md`, `docs/WORKFLOW.md` — the working
  standards for tests, logs, layering, error codes, CI, and delivery.
- `PROJECT-BRIEF.md` predates the backend: its "no backend yet" claim is
  outdated — do not learn auth/DB facts from it.
- Untracked-metadata rule of thumb: stack facts belong in AGENTS.md §2;
  keep this file about the SITE, not the repo plumbing.

## 12. Non-negotiables, one line each

1. Student-first: the student is the protected party; audience of any UI
   string is the student, not the developer.
2. No student-facing URL of any gated asset. Ever. Whichever button seems
   helpful is wrong if it carries the link.
3. Player = `ProtectedVideoPlayer.tsx`, one grant per mount from /api/play.
4. Drive = Google's frame only; our chrome = watermark/poster/hints/escape.
5. Watermark (email • phone) floats over EVERY playback mode,Fullscreen.
6. Playback gates: signed in + enrolled + views remaining; single session.
7. Completion = end-of-video; progress = parts; server overrides local.
8. Exams keyless to students; scoring server-side.
9. Lessons notices → sessions widget only; bell = merged list.
10. DB is the only truth; localStorage is a mirror (+ protected outbox).
11. Two languages, everywhere, always.
