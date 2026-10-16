# AGENTS.md — Project Guide for AI Coding Agents

Read this entire file before doing anything else. It is the source of truth for this repo.
If it conflicts with your assumptions about how a "typical" React / PostgreSQL / Vercel app works, this file wins.
Anything marked `TODO` has NOT been verified yet — do not rely on it until it is filled in (see Section 12).

---

## 0. Rules of engagement (most important)

1. **Plan before editing.** Restate the task in your own words, list the exact files you will touch and why, then wait if anything is ambiguous.
2. **Smallest possible change.** No refactors, renames, file moves, formatting sweeps, dependency upgrades, or "cleanups" unless I explicitly ask.
3. **Never invent things.** Don't guess table names, columns, API routes, env vars, or library APIs. If you can't find it in the code, say so and ask.
4. **Never touch without asking:** `.env*`, `vercel.json`, lockfiles, already-applied migrations, CI config, and anything listed in Section 10.
5. **Targeted edits only.** Don't rewrite or regenerate whole files. Don't delete files without asking.
6. **Verify every change.** After editing, run the commands in Section 3 (typecheck → lint → build). Show me the real output. If something fails, fix YOUR change or revert it — do not stack more changes on top of a broken state.
7. **One task at a time.** When done, stop and summarize: files changed, what changed, how you verified it.
8. **If you broke something:** run `git status` and `git diff`, revert your own changes, then retry with a smaller change. Don't "patch over" a mess.
9. **Don't trust old context.** If this session has been long or confusing, say so and re-read the relevant files from disk instead of relying on memory of earlier edits.
10. **Debug with evidence, not by asking me to test.** Follow the protocol in Section 13: reproduce the problem yourself, read the logs, find the earliest failing event, and verify the fix yourself. Only ask me to test when it truly requires something you cannot do (real device, my logged-in browser session, production-only secrets) — and then tell me exactly what to do and which request ID to send back.
11. **Git authorship — always this identity, never OpenCode.** For whatever you commit/push, use username `qhmed67` and email `ahmedalmslm74@gmail.com`. Never attribute work to OpenCode, never add OpenCode as co-author (`Co-authored-by`), never add generated-by/AI footers. Reason: owner wants sole authorship recorded as himself.
12. **Push, don't park.** Vercel deploys from GitHub on push — local commits change nothing live. After committing, always push (`git push origin <branch>`) and confirm it landed (`git status` clean, log shows commits on `origin`). Never leave fixes sitting local-only.

---

## 1. What this app is

TODO: 2–4 sentences. What it does, who uses it, what the main user flows are.

## 2. Stack

TODO: fill each line from the real files (package.json, configs), don't guess.

- Frontend: React `TODO version`, language `TODO (TS/JS)`, bundler `TODO (Vite / CRA / Next.js)`
- Routing: `TODO`
- State / data fetching: `TODO (Redux / Zustand / React Query / Context ...)`
- Styling: `TODO (Tailwind / CSS modules / ...)`
- Backend: `TODO (Vercel Serverless Functions in /api, Express, Next.js route handlers, ...)`
- Database: PostgreSQL, provider `TODO (Neon / Supabase / Vercel Postgres / other)`
- DB access layer: `TODO (pg / Prisma / Drizzle / Supabase client / Knex ...)`
- Hosting: Vercel (project name `TODO`)
- Package manager: `TODO (npm / pnpm / yarn)` — use ONLY this one

## 3. Commands

TODO: copy the real scripts from package.json.

```
install:    TODO
dev:        TODO
typecheck:  TODO
lint:       TODO
test:       TODO
build:      TODO
db migrate: TODO
```

Definition of "done": typecheck passes, lint passes, build passes, and the feature works in `dev`.

## 4. Folder map

TODO: generate from the real tree (exclude node_modules, dist, .git, .vercel). One line per important folder/file.

```
/
├── TODO
```

## 5. Architecture and data flow

TODO: describe the real flow, e.g.
`Component → hook/service → fetch('/api/...') → API handler → DB query → JSON response → UI`
Name the actual files for each hop for the 2–3 most important features.

## 6. Database

- Source of truth for the schema: `TODO (migrations folder / schema.prisma / schema.sql)`
- Connection: `TODO (env var name, pooled vs direct)`.
- Serverless rule: create the DB client/pool ONCE at module scope and reuse it. Never create a new pool/client per request. Use the pooled connection string on Vercel.
- Never run destructive SQL (`DROP`, `TRUNCATE`, `DELETE` without `WHERE`) or edit applied migrations. Schema changes = a NEW migration file.
- Always use parameterized queries. Never build SQL with string concatenation.

## 7. Environment variables

List NAMES only. Never print, log, or commit values.

| Name | Used where (client/server) | Purpose |
|------|---------------------------|---------|
| TODO | TODO | TODO |

Rules: client-exposed vars need the bundler prefix (`VITE_` for Vite, `NEXT_PUBLIC_` for Next). Server secrets must never be referenced from client code. Changing env vars on Vercel requires a redeploy.

## 8. Vercel gotchas (common causes of "works locally, breaks in production")

- Client-side routing needs a rewrite to `index.html` in `vercel.json`, otherwise refreshing a route returns 404.
- Import paths are **case-sensitive** on Vercel (Linux). `./Header` ≠ `./header`.
- Serverless functions have timeouts and cold starts; keep handlers short and stateless.
- The runtime filesystem is read-only; never write files at runtime.
- Don't import server-only code (db client, secrets) into client bundles.
- Build must pass with a clean install (`rm -rf node_modules && install && build`). Don't depend on locally installed packages that aren't in package.json.

## 9. Conventions

TODO: verify from existing code, then list. e.g. naming (components PascalCase, hooks `useX`), where API calls live, how errors are handled, how loading states are shown, TS strictness. **Follow the patterns already in the code; don't introduce new ones.**

## 10. Fragile areas / do-not-touch

TODO: list files or flows that are easy to break (auth, payments, DB connection, build config, anything the owner names).

## 11. Stable baseline (reference point)

The owner has marked the best known state of this project. Treat it as ground truth for "what working looks like". The owner fills the fields below; you may verify them (`git tag -l`, `git cat-file -t <sha>`) but must NEVER invent or "correct" them.

- **Baseline tag:** `stable-2026-10-16` — **commit:** `4d563a9ce51594061643d42ec7147c81458a994e` (verified: tag + `stable` branch pushed to origin 2026-10-16)
- **Branch holding it:** `stable`
- **Vercel deployment of the baseline:** `TODO (owner: paste deployment URL or ID from dashboard)`
- **Database state at baseline:** migrations confirmed applied up to `20261035`; `20261036`–`20261040` shipped after — UNVERIFIED whether applied; schema snapshot at `TODO (none exists yet)`
- **Known issues at baseline (only these; do NOT fix them unless I ask):**
  1. Viewer-only Drive files fall back to manual minutes when the server probe fails (needs `GOOGLE_API_KEY` + Drive API).
  2. `notifyNewLessons` export in `src/lib/db/adminUsers.ts` is dead (trigger + ensure replaced it).
- **Checks that passed at baseline:** typecheck clean (`tsc -b`), build green (`vite build`), 117/117 unit tests green (run 2026-10-16); lint = pre-existing warnings + 4 pre-existing errors (unchanged from before); smoke checks = `TODO (owner: manual pass)`
- **Changes since baseline / current task:** `TODO (update per task)`

How to use the baseline:

1. Before any task, run `git status` and `git log --oneline <baseline-tag>..HEAD`, and tell me how far HEAD has drifted from the baseline.
2. If something that worked at the baseline is broken now, it is a **regression**. Locate it with `git diff <baseline-tag>` (or `git bisect` between the baseline and HEAD). Fix it with a minimal change or by reverting the offending change — not with workarounds.
3. The two known issues must not get worse. Any NEW misbehavior is a regression, even if it looks unrelated.
4. If you can't resolve a regression within the iteration cap (Section 13.5), propose restarting from the baseline: `git switch -c fix/<name> <baseline-tag>`, then re-apply the wanted change from scratch in smaller steps. Never `git reset --hard`, force-push, or rewrite history on the main branch without asking.
5. Never move or delete the baseline tag/branch. A new baseline is created only when I say so (new tag + update this section).
6. Git does not undo database changes. Reverting code does NOT revert the DB. Compare migrations against "Database state at baseline" before assuming a revert is safe.

---

## 12. First-run bootstrap (do this once if any TODO remains)

Do NOT modify any source file during bootstrap. Only edit this file.

1. Run `git status` and `git log --oneline -20`. Report uncommitted changes and recent commits.
2. List the tree (exclude node_modules, dist, build, .git, .vercel).
3. Read: package.json, lockfile name, vercel.json, bundler config (vite/next), tsconfig, eslint config, `.env.example` (names only).
4. Read the entry points: main/index, App, router, and the API folder (every route handler's file name and what it does).
5. Read the DB layer: schema/migrations, the client setup file, and 2–3 representative queries.
6. Trace ONE full feature end to end (UI → API → DB) and document it in Section 5.
7. Fill every TODO above with facts verified from files. For anything you could not verify, write `UNVERIFIED: <what you need>` instead of guessing.
8. Run typecheck and build; record whether they currently pass, and paste the first errors if they don't.
9. Assess the logging situation against Section 13: what exists today (console.log only? any request IDs? error boundary? persisted logs?), what is missing, and a step-by-step plan. **Propose only; do not implement.**
10. Show me the final diff of AGENTS.md and **wait for my approval** before doing any other work.

---

## 13. Logging infrastructure and self-debugging protocol

**Goal:** you must be able to find the ROOT CAUSE of an error from logs and your own test runs, without waiting for me to click through the app after every change.
Adding this logging is an explicit exception to the "smallest change" rule, but implement it only as a separate approved task, in the small steps listed in 13.6.
Everything here must work on free infrastructure (zero budget): Postgres table + console + optional free-tier tools.

### 13.1 Core principles

- **One request ID follows an action through every layer:** UI → API → DB. Generate it in the frontend per user action (or per fetch), send it as the `x-request-id` header, reuse it server-side (generate one if missing), and put it in EVERY log line and in every error response body.
- **Structured JSON logs only.** No scattered `console.log("here")`. All logging goes through one logger module per side (`src/lib/logger.*` for client, `api/_lib/logger.*` or equivalent for server — use the real paths of this repo).
- **Log at boundaries, not in loops:** request start/end, DB query start/end/error, external calls, auth decisions, state transitions, caught errors.
- **Logging must never break the app.** Wrap in try/catch, never `await` slow log writes on the critical path (fire-and-forget), never throw from the logger.
- **Never log secrets or PII:** passwords, tokens, cookies, `Authorization` headers, connection strings, full emails/phones, request bodies by default. Redact by key name (`password`, `token`, `authorization`, `cookie`, `secret`, `key`, `database_url`).

### 13.2 Log line shape

```json
{
  "ts": "ISO-8601",
  "level": "debug|info|warn|error",
  "layer": "ui|api|db",
  "requestId": "uuid",
  "event": "short_snake_case_name",
  "route": "/api/...",
  "method": "GET",
  "status": 500,
  "durationMs": 123,
  "userId": "optional, id only",
  "error": { "name": "", "message": "", "stack": "", "code": "", "constraint": "", "detail": "" },
  "meta": {}
}
```

### 13.3 What to capture per layer

- **API:** wrap every handler in a `withLogging(handler)` helper that logs request start, final status, duration, and catches any thrown error (log name/message/stack, return a safe JSON error `{ error, requestId }` — never leak stacks to the client in production).
- **DB:** wrap the query function: log a query NAME or label (not raw values), duration, row count, and on failure the Postgres error fields (`code`, `constraint`, `detail`, `table`, `column`). Warn when a query exceeds a slow threshold (e.g. 500 ms).
- **UI:** a fetch wrapper that creates/attaches the request ID and logs failed or slow responses; a React `ErrorBoundary`; `window.onerror` and `unhandledrejection` handlers. Ship client logs (warn and error only) to `/api/log` in batches with `navigator.sendBeacon`, rate-limited, so they land in the same store as server logs.
- **Build/deploy:** record the git commit SHA (`VERCEL_GIT_COMMIT_SHA`) in `meta` so every log says which deployment produced it.

### 13.4 Storage and how YOU read the logs

Vercel's runtime logs on free plans are short-lived, so persist logs ourselves:

1. **Console (always):** JSON lines to stdout → visible in Vercel runtime logs (`vercel logs <deployment-url>` if the CLI is logged in) and in the terminal during `dev`.
2. **Local dev file:** also append JSON lines to `logs/dev.log` (gitignored) so you can `tail` / `grep` it directly.
3. **Postgres table `app_logs`** (new migration; columns = fields in 13.2, `meta` and `error` as JSONB, indexes on `request_id`, `ts`, `level`). Insert asynchronously from the logger. Retention: delete rows older than 7 days (Vercel cron or a manual script).
4. **Query script** (no UI needed): `scripts/logs.*` exposed as `npm run logs -- --request <id>`, `--level error --since 30m`, `--route /api/x --since 1h`. Output is time-ordered. This is your main debugging tool.
5. **Optional, free tier:** Sentry for client error grouping with source maps. Only add if I ask.

### 13.5 Self-debugging protocol (follow in this order)

1. **Reproduce it yourself.** Use `curl` / a small `scripts/smoke.*` against the local dev server or preview URL, a unit/integration test, or headless Playwright for UI flows. Capture the request ID of the failing run.
2. **Read the evidence.** Run the log script for that request ID and read the whole chain in time order.
3. **Find the earliest failure, not the last.** The root cause is the first `warn`/`error` event in the chain. Later errors are usually consequences. Say which event it is and in which file/function it originates.
4. **Hypothesis → check.** State the hypothesis in one sentence. If the logs can't confirm or reject it, add the smallest targeted log at the gap (mark it `// DEBUG-TEMP`), re-run, read again. Don't guess-fix.
5. **Fix minimally**, then re-run the same reproduction and confirm via logs that the chain is clean (expected status, no error events, sane durations). Run typecheck + build.
6. **Clean up:** remove every `DEBUG-TEMP` log you added. Keep the permanent structured logs.
7. **Iteration cap:** if 5 reproduce→read→fix cycles don't resolve it, STOP and report: what you tried, the earliest failing event, the request IDs, and what you need from me. Do not keep stacking changes.
8. **Report format:** root cause (file + line + why), evidence (request ID + the key log lines), fix (files changed), verification (commands + results).

When you genuinely need me to test something, give me exact steps and tell me to send back the request ID (shown in the error response and in the UI error toast/console) — not a screenshot of "it doesn't work".

### 13.6 Implementation plan (separate approved task, one step at a time, verify after each)

1. Server logger module + request ID helper + redaction (no behavior change).
2. `withLogging` API wrapper applied to routes, one route first, then the rest.
3. DB query wrapper with timing and Postgres error fields.
4. Client logger, fetch wrapper with `x-request-id`, ErrorBoundary and global handlers.
5. `app_logs` migration + async persistence + `/api/log` endpoint (validate, size-limit, rate-limit).
6. `scripts/logs.*` query tool + `logs/` in `.gitignore` + document the commands in Section 3.
7. Update Sections 3, 5 and 7 of this file with the real commands, file paths and any new env vars.
