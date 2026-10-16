---
description: Final gate before merge — full verify, independent review via BRIEF/REPORT, docs check, summary.
agent: build
---
Finish the current task:

1. Run `scripts/verify.sh` (full). If red, fix the CAUSE (checks are enforced; never weaken them) and rerun.
2. `git diff --stat`: confirm the diff contains only what the task required; revert unrelated edits.
3. Send @reviewer a BRIEF (docs/WORKFLOW.md) with the plan path (if any) and "Done when: VERDICT PASS". Fix every BLOCKER/MAJOR minimally, rerun verify. Max 2 review rounds, then report what remains instead of looping. Do not trust the REPORT's "verify green": you ran it.
4. Docs in this change if applicable: module map in docs/ARCHITECTURE.md, ADR, docs/ERROR-CODES.md, `.env.example`, plan checkboxes/status.
5. Final message: summary, what you did NOT touch, evidence (verify output tail), reviewer verdict, residual risks, unrelated issues noticed. Do not push; I will.

Extra context: $ARGUMENTS
