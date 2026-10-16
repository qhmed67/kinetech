# CI/CD
One principle: CI runs exactly `scripts/verify.sh`. If it is green locally it is green in CI.

## CI (every PR and push to main) — template: `.github/workflows/ci.yml`
1. Install toolchains + dependencies (cached).
2. `scripts/verify.sh` -> lint, typecheck, arch, tests, build.
3. Secret scan (gitleaks) and dependency review on PRs.
4. Protect `main`: require the CI checks, require PR, no direct pushes, no force-push.
Keep CI under ~10 minutes; split slow E2E into a separate job that still blocks merge.

## CD (deploy)
- Deploy only from `main`, only after CI is green. Never from a laptop.
- Pipeline: build artifact once -> deploy to staging -> smoke tests -> promote the SAME artifact to production (manual approval is fine early on).
- Every deploy is reversible: keep the previous artifact and know the one-command rollback.
- Risky features go behind a feature flag so rollback = flip a flag.
- After deploy: smoke test + watch error rate by `error.code` for a few minutes (see docs/LOGGING.md).

## Database migrations (expand -> migrate -> contract)
1. Expand: add new columns/tables nullable/additive. Old code still works.
2. Migrate: backfill data; deploy code that writes both / reads new.
3. Contract: remove old columns only in a LATER release.
Never ship a migration that breaks the currently deployed version. Migrations are L3.

## Rules for agents
- CI/CD, deploy scripts, migrations and secrets handling are L3. Edits require approval (opencode will ask on `.github/workflows/*`).
- Never disable, skip or loosen a CI step to make a build pass. Fix the cause or report it.
- Never put secrets in workflows or code; use the platform's secret store.
- Pin third-party actions to a version; prefer official or well-known ones.
