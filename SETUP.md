# Setup

## Install (5 minutes)
```bash
cp -r opencode-kit/. /path/to/project/        # trailing "/." copies dotfiles too
cd /path/to/project
chmod +x scripts/*.sh .githooks/*
git config core.hooksPath .githooks           # activates pre-commit + commit-msg (once per clone)
mv .verify-dirs.example .verify-dirs          # only for multi-stack repos: list stack dirs
mv .arch-rules.example .arch-rules            # only for stacks without a real boundary tool (e.g. Flutter)
printf '\nlogs/\n' >> .gitignore
rm SETUP.md                                   # optional
```
Needs: `bash`, `git`, `python3` (log tools). Then run `opencode` and `/bootstrap`.
Also on GitHub: protect `main` (require CI, require PR, "Require review from Code Owners") and edit `.github/CODEOWNERS`.

## Two tiers — start with Tier 1 only
| Tier | Files | Adopt |
|---|---|---|
| 1. Enforcement (the part that actually stops spaghetti) | `scripts/*`, `.githooks/`, `.opencode/plugins/`, `opencode.json`, `ci.yml`, an `arch` check for your stack (skill `setup-guardrails`), logger from `templates/logging/` | day one |
| 2. Process (only when the work needs it) | `@architect`, `@tester`, `docs/plans/`, ADRs | when you do your first L3 task |
Cost control: for L0/L1 the agent reads only AGENTS.md (~60 lines) + docs/ARCHITECTURE.md; every other doc/skill loads on demand. If an L2 feature regularly takes over ~1 hour, delete process, not checks.

## Daily use
| You want | You do |
|---|---|
| Tiny change / small bug | just describe it (agent picks L0/L1; bugs load skill `fix-bug`) |
| New feature | `/feature <description>` |
| Finish | `/ship` |
One task per session. New task = new session; the plan file, ADRs and tests are the memory.

## What is enforced vs. what is only advice (be realistic)
- HARD (fails build/commit or blocks the tool call): arch violations (after you set up the `arch` step), weakened tests, unregistered error codes, print-logging, `--no-verify`, edits to enforcement files, red verify in CI.
- ADVICE (agent may still get it wrong; reviewer and you catch it): where business logic sits, naming, whether the design is the simplest one, quality of `ctx` in logs.
- Machine checks are diff-aware: old debt isn't flagged until a file is touched (`GUARD_ALL=1` checks everything). A guardrail you haven't seen fail isn't one; the skill `setup-guardrails` makes the agent prove each rule by breaking it once.
- A human can lift the plugin for a session with `GUARDRAILS_UNLOCK=1 opencode`, and bypass the test guard once with `ALLOW_TEST_CHANGES=1` (when behavior intentionally changes).
- The plugin's bash filtering is a speed bump (a determined model could obfuscate a command); the real backstops are the git hook, CI and CODEOWNERS.

## Tuning
- Give `@reviewer` a different model than the coder (`model: provider/id` in `.opencode/agents/reviewer.md` frontmatter) to avoid self-confirming reviews.
- Every time the agent repeats a mistake, prefer adding a check to `scripts/` over adding a sentence to AGENTS.md. Keep AGENTS.md under ~90 lines (currently ~60).

## Troubleshooting
- opencode won't start: remove the `"task": {...}` block in `opencode.json` and the `task: deny` lines in `.opencode/agents/*.md` first (permission keys changed across versions); compare with https://opencode.ai/docs/agents/. Next suspects: `steps:` lines, the plugin file (https://opencode.ai/docs/plugins/).
- Plugin not loading: it must be at `.opencode/plugins/guardrails.ts`; restart opencode.
- `verify` says "no stack checks ran": set up `.verify-dirs`/package scripts; that is intentional (fail closed).
- Hook not firing: `git config core.hooksPath` must print `.githooks` and the hook files must be executable.
