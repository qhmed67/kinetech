# AGENTS.md
Short on purpose. Anything a tool can enforce is enforced by a tool (section 2), not by this prose. Details live in `docs/` and are read on demand (section 6).
Your job: ship changes that WORK and FIT the existing architecture. Not clever. Not bigger than asked.

## 1. Project (filled by `/bootstrap`)
- What it is: <one line>
- Stacks and directories: <e.g. `api/` Python/FastAPI, `web/` Next.js, `mobile/` Flutter>
- Done = `scripts/verify.sh` green (iterating: `scripts/verify.sh quick`). Non-obvious commands: <only if any>

## 2. Enforced by machines — you cannot bypass these, so do not try
| Rule | Enforced by |
|---|---|
| Dependency direction, no cycles, no framework imports in domain | `arch` step of `scripts/verify.sh` (dependency-cruiser / import-linter / `.arch-rules`) |
| Tests not deleted, skipped, or loosened | `scripts/guard-tests.sh` (inside verify) |
| New failure paths have a registered error code; no print/console.log | `scripts/check-error-codes.sh` (inside verify) |
| Log lines follow the schema in docs/LOGGING.md | `scripts/check-logs.sh` (integration test) |
| Enforcement files untouchable, `--no-verify` and guard overrides blocked | `.opencode/plugins/guardrails.ts` + permissions in `opencode.json` |
| Green quick-verify and Conventional Commits before every commit | `.githooks/` |
| Same gate on every PR; main protected | CI + branch protection |
If a check fails: fix the CODE. If you think a check is wrong: STOP and tell me. Never edit, disable, skip or work around a check.

## 3. Judgment rules (what tools cannot check)
1. Reuse before create: search for an existing helper/pattern and copy the nearest similar feature. A new library, pattern or folder convention = L3 + ADR.
2. Business rules live only in domain/application (tools catch imports, not where logic sits). Controllers/UI/ORM/SQL hold none.
3. Baseline first: run `scripts/verify.sh quick` before editing. If already red, report it; do not mix old failures with your change.
4. No test, no touch: write a characterization test before changing untested code. Bug => failing test first, then root-cause fix.
5. Smallest diff. No drive-by refactors, renames, formatting sweeps or dependency bumps. Unrelated problems: list at the end, don't fix.
6. TWO-STRIKES: if the same failure survives 2 fix attempts, STOP. Revert to the last green commit, explain what you learned, offer 2-3 options. Never widen scope, rewrite modules or switch approach silently.
7. Public contracts (API shapes, DB schema, event payloads, signatures used across modules) change only via L3.
8. Never print, log or commit secrets. Edit `.env.example`, never `.env`.
9. Logging per docs/LOGGING.md: the project logger, once at the point an error is handled, with an error code row in docs/ERROR-CODES.md.
10. Long session? Re-read a file before editing it; never edit from memory.

## 4. Levels — pick the LOWEST that fits and state it in the first line of your reply
| Level | When | Process | Subagents |
|---|---|---|---|
| L0 | typo, copy, config value, comment, rename inside one file | do it -> `verify quick` | none |
| L1 | bug fix/tweak inside ONE module; no contract/schema/dependency change | (bug: failing test first) -> change -> `verify` | none |
| L2 | new behavior; 2+ modules, or new endpoint/screen/query | `/feature`: plan (<=15 lines) -> tests -> vertical slices -> `/ship` | @reviewer |
| L3 | new module/layer, schema or contract change, auth/payments/security, new dependency, cross-stack, multi-module refactor | `/feature`: @architect -> plan file + ADR -> I approve -> (@tester) -> slices -> `/ship` | @architect, @tester, @reviewer |
Escalate: if mid-task you must touch another module, a contract or the schema, STOP, say "escalating to L2/L3", follow that level. Unsure? Pick one higher.
Subagent hand-offs use the BRIEF/REPORT protocol and the plan file (docs/WORKFLOW.md). Subagents report; only you edit and only you write the plan.

## 5. Done
`scripts/verify.sh` green (show the tail) · behavior-level tests for new/changed behavior · docs updated in the same change if a module moved, a decision was made, an error code or env var was added · final message: what changed, what you did NOT touch, risks.

## 6. Read when (do not read everything up front; docs/ARCHITECTURE.md is already loaded)
| Situation | Read |
|---|---|
| Planning L2/L3, hand-offs, long task | docs/WORKFLOW.md, docs/plans/TEMPLATE.md |
| Writing tests | docs/TESTING.md |
| Logs, error handling, new failure path | docs/LOGGING.md + docs/ERROR-CODES.md |
| Bug, stack trace, log line, error code, correlation id | skill `fix-bug` |
| Lint/arch tooling setup | skill `setup-guardrails` |
| CI/CD, deploy, migrations | docs/CI-CD.md (L3) |
| Design decision | docs/DECISIONS.md |

## 7. Git and communication
Branch per task (`feat/…`, `fix/…`), never commit to main, commit after each green slice, never push/force/`reset --hard` unless asked. Ambiguous AND wrong guess is expensive: ask ONE question; otherwise state the assumption and proceed. Say plainly what you could not verify.
