# Contributing

## Branches

- `main` is always deployable. Changes only via Pull Request.
- `feat/react-native` is the long-lived integration branch for the mobile initiative. Sub-branches branch from it (or relevant parent), one purpose per branch, naming `<type>/<scope>-<short-description>` (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`, `build`).
- Merges: sub-branch → `feat/react-native` uses **squash-merge**; `feat/react-native` → `main` (milestones only) uses **merge-commit, no squash** so `git revert -m 1` works. Delete merged branches except `backup/*`.

## Commits

- Conventional Commits, small and atomic. Verify with `git status` before committing; never commit secrets, `.env`, build artifacts, `node_modules`, or local-only working files (see note below).
- Use one npm version; do not commit unintended lockfile churn. Node 24 is required.

## Process files

- `docs/STABLE-VERSION.md` holds stable tags, SHAs, and rollback commands. Update it at every milestone and before every merge into `main`. Every PR includes a Rollback plan referencing it.
- Some paths are local-only working files (gitignored via `.git/info/exclude`, not listed here). They remain on each machine and are never committed or pushed.

## Verify

- Definition of done: `npm run lint`, `npx tsc -b`, `npm run test:unit`, `npm run build` on Node 24. Show real output; on failure, fix or revert your change — do not stack more changes on a broken state.
- Before touching `api/*`, `.env*`, `vercel.json`, or migrations: stop and ask the maintainer first.
