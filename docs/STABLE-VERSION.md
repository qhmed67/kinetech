# Stable Version — rollback & stable markers

Tags, SHAs, dates, build IDs, rollback commands only. History is append-only.

## Web

- Last stable: tag `web-stable-v1.0.0-pre-mobile`, SHA `6e67bf0286bfde937ce85fa88d646679d8eed9b8`, date 2026-10-19, branch `main`, Vercel deployment: production Ready 2026-10-19 03:45 GMT+3 (dpl from `91ba6a3`, plus baseline doc commits `ee832f4`, `6e67bf0`).
- Verified: Node 24 install→lint (warnings only, baseline)→`tsc -b` clean→`test:unit` 119/119→`vite build` green.
- Earlier baselines: `stable-2026-10-19` @ `91ba6a36c0d32c6b2e5890c8bc9229ba456870a8`, `stable-2026-10-16` @ `4d563a9ce51594061643d42ec7147c81458a994e` (branch `stable`).
- Env var NAMES: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (legacy `VITE_SUPABASE_PUBLISHABLE_KEY`); server `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`.
- Rollback (web only): Vercel Dashboard → Deployments → promote previous. No git history change. Do not touch `apps/mobile` or `packages/*`.
- Phase 1 (chore/monorepo-foundation, pending preview/merge): SHA `8a02453a7ccf38f3628b1f78e3e6321c5768379b`, date 2026-11-08, branch `chore/monorepo-foundation`, Node 24 install→lint (4 pre-existing errors, same baseline)→`tsc -b` clean→`test:unit` 119/119→`vite build` green in `apps/web`. Awaiting Vercel preview check.

## Mobile (Android / iOS)

- No stable mobile build yet. Tags `stable/mobile-YYYY-MM-DD` and `mobile-vX.Y.Z` will be added after Phase 9 / milestone merges.

## Shared packages

- No stable packages yet (monorepo not created).

## Supabase schema

- Compatible through migrations `20261041` (applied 2026-10-19 per owner). New migrations are additive files only.

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
