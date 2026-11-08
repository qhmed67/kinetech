# Stable Version — rollback & stable markers

Tags, SHAs, dates, build IDs, rollback commands only. History is append-only.

## Web

- Last stable: tag `web-stable-v1.0.0-pre-mobile`, SHA `6e67bf0286bfde937ce85fa88d646679d8eed9b8`, date 2026-10-19, branch `main`, Vercel deployment: production Ready 2026-10-19 03:45 GMT+3 (dpl from `91ba6a3`, plus baseline doc commits `ee832f4`, `6e67bf0`).
- Verified: Node 24 install→lint (warnings only, baseline)→`tsc -b` clean→`test:unit` 119/119→`vite build` green.
- Earlier baselines: `stable-2026-10-19` @ `91ba6a36c0d32c6b2e5890c8bc9229ba456870a8`, `stable-2026-10-16` @ `4d563a9ce51594061643d42ec7147c81458a994e` (branch `stable`).
- Env var NAMES: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (legacy `VITE_SUPABASE_PUBLISHABLE_KEY`); server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`.
- Rollback (web only): Vercel Dashboard → Deployments → promote previous. No git history change. Do not touch `apps/mobile` or `packages/*`.
- Phase 1 (verified, merged to feat/react-native): SHA `fa43af3b4219e0ca29198a22f079a559e6774f13`, date 2026-11-09, branch `feat/react-native`, preview READY. Node 24 install→lint (4 pre-existing errors, identical baseline)→`tsc -b` clean→`test:unit` 119/119→`vite build` green; e2e 5/5 vs production build.
- Phase 2 (verified, merged to feat/react-native): SHA `77511c0`, date 2026-11-09, branch `feat/react-native`. Tokens identical (compiled CSS color diff empty); e2e 5/5 before+after; hex grep 147 unchanged.

## Mobile (Android / iOS)

- No stable mobile build yet. Tags `stable/mobile-YYYY-MM-DD` and `mobile-vX.Y.Z` will be added after Phase 9 / milestone merges.

## Shared packages

- No stable packages yet (monorepo not created).

## Supabase schema

- Compatible through migrations `20261041` (applied 2026-10-19 per owner). New migrations are additive files only.

## Vercel project settings (Web)

- Current: Root Directory `apps/web`; Include source files outside Root Directory enabled; Node.js Version `24.x`; Install Command `cd ../.. && npm ci`; Build Command `npm run build`; Output Directory auto (`dist`).
- Re-verify: Settings → General shows above; Deployments → latest preview from `feat/react-native` is Ready; `POST /api/play` (no token) returns 401 (function responding).
- Revert (if preview fails or old layout restored): Root Directory → empty (repo root); Install/Build → defaults (empty); Output → empty; Node.js Version → `24.x` (unchanged); Include outside → enabled (unchanged). Redeploy after.
- Previous values before Phase 1: Root Directory empty, Install/Build defaults, Node `24.x`, Include outside enabled.

## History (append-only)

| Date | Deliverable | Tag | SHA |
|---|---|---|---|
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
