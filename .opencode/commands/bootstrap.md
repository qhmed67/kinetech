---
description: One-time setup for an existing or new repo — detect stacks, fill AGENTS.md, map architecture as-is, baseline verify, propose guardrails. Does not change source code.
agent: build
---
Bootstrap this repository for the agent workflow. Do NOT modify source code, tests or CI in this command; only AGENTS.md section 1, docs/ARCHITECTURE.md (module map), `.verify-dirs`, and report.

1. Detect stacks and their directories (manifests: package.json, pyproject.toml, go.mod, pubspec.yaml, Cargo.toml, etc.). Write `.verify-dirs` (one directory per line) if there is more than one stack dir.
2. Fill AGENTS.md section 1 (what it is, stacks/dirs, non-obvious commands). Keep it short; do not paste directory trees.
3. Map the EXISTING architecture into the module map in docs/ARCHITECTURE.md: modules, what each owns, public API, dependencies. Then list (do not fix) violations you see: wrong-direction imports, business logic in controllers/UI, circular dependencies, duplicated logic, god classes.
4. Run `scripts/verify.sh quick` and report the baseline: what passes, what fails, what was not detected.
5. Load skill `setup-guardrails` and propose the MINIMUM guardrail set per stack (architecture check, lint/type config, test command that does not watch). Rank by value/effort.
6. Identify the 5 riskiest areas with no tests (core business logic, money, auth, data writes) and propose characterization tests for them.
7. Check enforcement: do `scripts/verify.sh` stack checks exist for every stack (arch step!)? Are `.githooks` active (`git config core.hooksPath`)? Is CI present and is main protected? If hooks are not active, ask ME to run `chmod +x scripts/*.sh .githooks/* && git config core.hooksPath .githooks` (you are not allowed to change hook config).
8. Check logging: is there a structured logger? correlation id? Report gaps against docs/LOGGING.md.

Final report: baseline status, violations found, proposed guardrails (ordered), proposed first 3 tasks. Ask me which to start with. Context: $ARGUMENTS
