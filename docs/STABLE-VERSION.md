# Stable Version — rollback & stable markers

Tags, SHAs, dates, build IDs, rollback commands only. History is append-only.

## Web

- **Last stable (web + mobile shell):** tag `stable-2026-11-23`, SHA `598e17ae7cc061faec90c01565d99be326cb435a`, date 2026-11-23, branch `main`. This is the owner-declared most stable build.
- Verified (2026-11-23): PR #45 CI [45216691712](https://github.com/qhmed67/kinetech/actions/runs/45216691712) — Unit (Vitest) pass, E2E (Playwright) pass, Vercel preview pass. Main CI after merge [45222164421](https://github.com/qhmed67/kinetech/actions/runs/45222164421) — success. Local full gate not run this session (Node 18.19.1; repo requires Node 24).
- Contents: native expanded-player scroll lock (ref-counted `useScrollLock` while native expanded/transitioning), expanded containers hardened with `100dvh`/`overscroll-behavior: contain`/control-safe `touch-action`, RN WebView `scrollEnabled/bounces` disabled while expanded; Direct Drive native fullscreen click capture fix and test-prop fix from earlier 78224ec.
- Previous stable: tag `stable-2026-11-21`, SHA `cf4b0b58e97eaecb2241be81f25a1443e72c41c2`, date 2026-11-21, branch `feat/mobile-screens` (pushed).
- Previous stable: tag `web-stable-v1.0.0-pre-mobile`, SHA `6e67bf0286bfde937ce85fa88d646679d8eed9b8`, date 2026-10-19, branch `main`, Vercel deployment: production Ready 2026-10-19 03:45 GMT+3 (dpl from `91ba6a3`, plus baseline doc commits `ee832f4`, `6e67bf0`).
- Verified: Node 24 install→lint (warnings only, baseline)→`tsc -b` clean→`test:unit` 119/119→`vite build` green.
- Earlier baselines: `stable-2026-10-19` @ `91ba6a36c0d32c6b2e5890c8bc9229ba456870a8`, `stable-2026-10-16` @ `4d563a9ce51594061643d42ec7147c81458a994e` (branch `stable`).
- Env var NAMES: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (legacy `VITE_SUPABASE_PUBLISHABLE_KEY`); server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`.
- Rollback (web only): Vercel Dashboard → Deployments → promote previous. No git history change. Do not touch `apps/mobile` or `packages/*`.
- Phase 1 (verified, merged to feat/react-native): SHA `fa43af3b4219e0ca29198a22f079a559e6774f13`, date 2026-11-09, branch `feat/react-native`, preview READY. Node 24 install→lint (4 pre-existing errors, identical baseline)→`tsc -b` clean→`test:unit` 119/119→`vite build` green; e2e 5/5 vs production build.
- Phase 2 (verified, merged to feat/react-native): SHA `77511c0`, date 2026-11-09, branch `feat/react-native`. Tokens identical (compiled CSS color diff empty); e2e 5/5 before+after; hex grep 147 unchanged.
- Phase 3 (verified, merged to feat/react-native): SHA `dc2553e47646fe6a2e3b58dfd56033d3c68cf9af`, date 2026-11-09, branch `feat/react-native`. Core extraction (standalone utils); e2e 5/5 before+after; 119/119; hex 147.
- Phase 4a (verified, merged to feat/react-native): SHA `05f64cf61ae85c15688405d23f0e21ef6a6eb93e`, date 2026-11-09, branch `feat/react-native`. Supabase factory + thin web adapter; e2e 5/5 before+after; 119/119.

## Mobile (Android / iOS)

- **Owner task list:** `docs/mobile/OWNER-TASKS.md` (private, untracked) — every step that needs the owner, in order, with the exact commands.
- **Architecture (2026-11-11):** hybrid shell — the web app is the only UI (WebView), native owns the player/protection/storage. Plan: `2027-architecture.md`. The React Native UI rewrite is CANCELLED; the port is archived under tag `mobile-rn-ui-port` / branch `backup/mobile-rn-ui-port` (SHA `785d081`). `apps/mobile` is now the empty shell scaffold (EAS project `3d9573b0-bdc0-4f3a-bfa6-8829c092707f`).
- **Last stable (web + mobile shell):** tag `stable-2026-11-23`, SHA `598e17ae7cc061faec90c01565d99be326cb435a`, date 2026-11-23, branch `main`. Same CI gates as Web entry above.
- Runs in Expo Go (JS only): `npm run dev:go -w @kinetech/mobile`. The `KinetechSecurity` native module is unavailable there, so risk checks report safe defaults; only a development build (`npx expo run:android` / EAS) exercises them.
- Previous stable: tag `mobile-stable-v1.0.0`, SHA `051e06f`, date 2026-11-11, branch `main`. Verified: mobile `tsc --noEmit` clean; mobile jest 9/9; web `tsc -b` clean; `test:unit` 119/119; `vite build` green; hex grep clean outside tokens.
- Phase 6b–8 (verified, merged to main): SHA `051e06f`, date 2026-11-11, branch `main`. EAS profiles; dashboard/courses/watch screens restored; auth consolidated (authDb.ts + AuthProvider); ErrorBoundary + offline banner; token-only colors; mobile tests 9/9.
- Phase 10 – Web-parity port (verified, merged to main): SHA `d0df240`, date 2026-11-11, branch `main`, feature `feat/mobile-web-parity`. Landing/courses/course/watch/dashboard/baccalaureate/service/about/contact/legal/not-found + auth screens ported 1:1 from apps/web (web components via react-native-svg; fonts bundled per weight; POST /api/play ProtectedPlayer; server-scored exams; web i18n en+ar default ar; SecureStore caches). Gates: mobile `tsc --noEmit` clean; mobile jest 9/9; e2e bundle-check PASS (dev server :8081, router bundle 200); hex grep clean outside tokens.
- Phase 5 (verified, merged to main): SHA `e7cf2b6`, date 2026-11-10, branch `main`. Mobile UI components and screens implemented; React Native component library complete; e2e tests pass; 119/119 unit tests pass.
- Phase 6 (verified, merged to main): SHA `20fec13`, date 2026-11-10, branch `main`. Complete mobile app screens implemented; all core components built; database services complete; internationalization support; theme system; e2e tests pass; 119/119 unit tests pass.

## Shared packages

- No stable packages yet (monorepo not created).

## Supabase schema

- Compatible through migrations `20261041` (applied 2026-10-19 per owner). New migrations are additive files only.
- At `stable-2026-11-23`: unchanged from `stable-2026-11-21` (no new migrations). `20261112_video_source.sql` and `20261113_playback_devices.sql` — UNVERIFIED whether applied; `20261120_app_logs.sql` still NOT applied (owner must run it in the Supabase SQL editor).

## Vercel project settings (Web)

- Current: Root Directory `apps/web`; Include source files outside Root Directory enabled; Node.js Version `24.x`; Install Command `cd ../.. && npm ci`; Build Command `npm run build`; Output Directory auto (`dist`).
- Re-verify: Settings → General shows above; Deployments → latest preview from `feat/react-native` is Ready; `POST /api/play` (no token) returns 401 (function responding).
- Revert (if preview fails or old layout restored): Root Directory → empty (repo root); Install/Build → defaults (empty); Output → empty; Node.js Version → `24.x` (unchanged); Include outside → enabled (unchanged). Redeploy after.
- Previous values before Phase 1: Root Directory empty, Install/Build defaults, Node `24.x`, Include outside enabled.

## History (append-only)

| Date | Deliverable | Tag | SHA |
|---|---|---|---|
| 2026-11-23 | Web + mobile shell (stable) | `stable-2026-11-23` | `598e17ae7cc061faec90c01565d99be326cb435a` |
| 2026-11-21 | Web + mobile shell (previous stable) | `stable-2026-11-21` | `cf4b0b58e97eaecb2241be81f25a1443e72c41c2` |
| 2026-11-11 | Hybrid-shell architecture switch (RN UI cancelled) | `mobile-rn-ui-port` (archive) | `785d081` (archived port) / `399fe21` (plan) |
| 2026-11-11 | Mobile web-parity port (Phase 10) | — | `d0df240` (merge) / `5f73024` |
| 2026-11-11 | Mobile (Phases 6b–8) | — | `051e06f` |
| 2026-11-10 | Mobile | `mobile-stable-v1.0.0` | `d1186ff` |
| 2026-11-10 | Mobile (Phase 6 screens) | — | `20fec13` |
| 2026-11-10 | Mobile (Phase 5 UI-native) | — | `e7cf2b6` |
| 2026-10-19 | Web | `web-stable-v1.0.0-pre-mobile` | `6e67bf0286bfde937ce85fa88d646679d8eed9b8` |
| 2026-10-19 | Web (earlier) | `stable-2026-10-19` | `91ba6a36c0d32c6b2e5890c8bc9229ba456870a8` |
| 2026-10-16 | Web (earlier) | `stable-2026-10-16` | `4d563a9ce51594061643d42ec7147c81458a994e` |

## Rollback rules

- Never `git reset --hard` to an old web tag after mobile work exists (would delete the app). Never checkout old tags in the main folder; use `git worktree`.
- Web problem only: Vercel promote or `git revert` merge commit.
- Mobile problem only: revert PR/commits, EAS Update channel to previous bundle, or resubmit previous stable build.
- Shared problem: revert package change, re-verify both apps.
- Catastrophe: first create `rescue/YYYY-MM-DD-<reason>` ref of broken state, then `git revert -m 1 <merge>` or `git restore --source=<tag> -- <path>` for scoped restore. Full pre-mobile restore only on explicit instruction, after `archive/mobile-<date>` branch + tag.
- Check Supabase compatibility before any rollback. Never run destructive DB operations automatically.
