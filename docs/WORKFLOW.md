# Workflow details (levels, plans, subagents, context hygiene)
Summary table is in AGENTS.md section 3. Time targets: L0 ~2 min, L1 ~10-20 min, L2 ~30-90 min, L3 only when really structural.

## L0 Trivial
Do it. Run `scripts/verify.sh quick`. No plan, no subagent.

## L1 Small
1. Baseline: `scripts/verify.sh quick`.
2. Bug? Write the failing test first (see skill `fix-bug`). Tweak? Make sure a test covers the area; if not, write a characterization test first.
3. Smallest change. 4. `scripts/verify.sh`. 5. Commit.

## L2 Feature (use `/feature`)
1. Plan in chat, max 15 lines, using the template below. Wait for my "go" only if the plan touches a contract or you are unsure; otherwise continue.
2. Split into vertical slices: each slice is the smallest end-to-end change that can be tested and leaves verify green.
3. Per slice: failing test -> implement -> `verify` -> commit. Never start slice N+1 on a red slice N.
4. `/ship` at the end (runs verify, then `@reviewer`).

## L3 Structural (use `/feature`)
1. `@architect` returns a plan; save it to `docs/plans/YYYY-MM-DD-<name>.md` (checkboxes per slice).
2. Add or update the ADR in docs/DECISIONS.md.
3. I approve the plan. Do not implement before approval.
4. Execute slice by slice as in L2; tick the checkboxes in the plan file as you go (it is the handoff if the session dies).
5. DB/contract changes: expand -> migrate -> contract (additive first). See docs/CI-CD.md.
6. `/ship`.

## Plan template (L2 in chat, L3 in file)
```
Goal:        <one sentence, user-visible outcome>
Non-goals:   <what we will NOT do>
Touches:     <modules / files>   Contracts changed: <none | list>
Slices:      [ ] 1 <slice> — test: <what proves it>
             [ ] 2 ...
Risks/rollback: <what could break; how to undo (revert commit / flag)>
Logging/errors: <new events and error codes>
```

## Subagents — few, with a strict hand-off protocol
| Subagent | Role | Edits | Use when |
|---|---|---|---|
| @architect | design/plan | none | L3, or L2 where the structure is unclear |
| @tester | writes tests FIRST from the plan (so tests are not shaped around the implementation) | test files only | L3, or money/auth/data-integrity changes |
| @reviewer | independent adversarial review (architecture, tests, security, scope) | none | `/ship` on L2/L3 |
The MAIN agent is the only one that implements and the only one that writes the plan file. Subagents never spawn subagents (`task: deny`). One subagent at a time; never two agents editing the same files. Do not add roles until a recurring failure proves you need one.

### Hand-off protocol (prevents lost decisions and conflicting code)
Rules:
1. Shared state = the plan file (`docs/plans/<name>.md`, template provided) + ADRs. Not chat history, not summaries.
2. Pass PATHS, not prose: a subagent starts from zero context and reads what the BRIEF lists.
3. Decisions are recorded by the main agent in the plan's "Decisions in force" section BEFORE the next hand-off.
4. Never trust a REPORT: the main agent re-runs `scripts/verify.sh` itself and reads the diff.
5. A REPORT with a deviation or NEEDS_DECISION stops the line: main agent decides (or asks the human), records it, then continues.
6. Test-first order for L3: @tester writes failing tests for slice N (and proves they fail for the right reason) -> main agent implements until green -> tests are not edited by the implementer (guard-tests catches weakening) -> `/ship`.

BRIEF (main -> subagent), copy exactly:
```
BRIEF
Role: tester | reviewer | architect
Plan: docs/plans/<file>.md   Slice: <n>
Task: <one sentence>
Read first: <max 5 paths>
You may touch: <paths/globs | none>
Decisions in force: <ADR ids + "see plan: Decisions">
Done when: <observable: test names, commands, output expected>
Do not: <explicit non-goals>
```
REPORT (subagent -> main), copy exactly:
```
REPORT
Status: DONE | BLOCKED | NEEDS_DECISION
Files touched: <list or none>
Evidence: <commands run + last lines of real output>
Deviations from plan / decisions made: <none | list>
Open questions (max 3): <none | list>
```

## Context hygiene (why sessions drift)
- One task per session. New task = new session.
- Plan file + ADR + tests + docs are the memory. Do not rely on chat history.
- When a session gets long or the agent starts "creatively fixing": stop, `git stash` or commit the green state, start a fresh session, tell it to read the plan file and continue at the first unchecked slice.
- Re-read files before editing them in long sessions; do not edit from memory.
