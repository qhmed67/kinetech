# CI/CD

One principle: **CI runs the same checks you can run locally**, and nothing
else. If a step is not in the workflow, it does not happen.

## CI — `.github/workflows/ci.yml`

Triggers: every pull request to `main` (and to `feat/react-native`), and every
push to those branches.

Workflow-level permissions are `contents: read` — the jobs only read the
code. Third-party actions are pinned to a commit SHA (the version is written
in a comment next to the pin), so an action cannot be swapped without a
review of this file.

| Job | What it does |
|---|---|
| `unit` — Unit (Vitest) | Node 24, `npm ci`, `npm run test:unit` (vitest across the web app and the packages) |
| `e2e` — E2E (Playwright) | Node 24, `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e` |
| `public-surface` — Public surface | `bash scripts/check-public-surface.sh`: fails if a credential, a real infrastructure identifier or an owner-only document is about to become public |

The unit and e2e jobs read two public client variables from the platform's
secret store (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); no secret value
is ever written into a log line or into a build artifact.

**What CI does NOT do** (do not assume otherwise): it does not run a
dependency-review or a third-party secret scanner — the `public-surface` job
above is the only secret scan in place; it does not deploy; it does not apply
database migrations.

The local gate is `scripts/verify.sh quick` (fast) and `scripts/verify.sh full`
(complete). `scripts/check-public-surface.sh --staged` runs on every commit
through the git hook in `.githooks/pre-commit`.

`main` protection (required checks, required PR, no direct pushes) is a
setting of the repository, not something you can read from the files here.

## CD

- Builds and deployments are produced by the hosting platform's GitHub app
  from the pushed commit — one preview per pull request, one production
  deployment from `main`.
- Only `main` is deployable. A pull request never changes production.
- Every deployment is reversible: keep the previous one and promote it again
  from the hosting dashboard; a bad merge is reverted in git and redeployed.
- Migrations are applied by a human, in the database console, in order, one
  file at a time — never by CI and never from a laptop.

## Migrations (expand → migrate → contract)

1. **Expand** — add new columns/tables, nullable and additive; old code still
   works.
2. **Migrate** — backfill, then deploy code that reads both.
3. **Contract** — remove old columns only in a *later* release.

Never ship a migration that breaks the currently deployed version.

## Rules for agents

- CI/CD, deploy scripts, migrations and secrets handling are high-risk: edits
  require explicit approval.
- Never disable, skip or loosen a CI step to make a build pass. Fix the cause
  or report it.
- Never put a secret in a workflow or in code; use the platform's secret
  store.
- Pin third-party actions to a commit SHA; prefer official or well-known ones.
- This repository is public: keep credentials, real identifiers and owner-only
  documents out of it, and out of pull-request descriptions and commit
  messages.
