---
description: Build a feature with the right amount of process (L2 or L3). Plan, tests, vertical slices, hand-offs.
agent: build
---
Task: $ARGUMENTS

1. Classify the level (AGENTS.md section 3) and state it. If it is really L0/L1, just do it that way.
2. Baseline: `scripts/verify.sh quick`. If red, stop and report.
3. Plan. L2: max 15 lines in chat. L3: send @architect a BRIEF (docs/WORKFLOW.md) and save its plan into `docs/plans/YYYY-MM-DD-<name>.md` (copy docs/plans/TEMPLATE.md), add/update the ADR, then WAIT for my approval. Look for the nearest existing feature first and reuse it.
4. Per slice: (L3 or money/auth/data: send @tester a BRIEF to write failing tests first) -> implement until green -> run `scripts/verify.sh` yourself -> commit on a feature branch -> tick the plan checkbox and log the hand-off. Never start the next slice on red. Record every decision in the plan's "Decisions in force" BEFORE the next hand-off.
5. Follow docs/LOGGING.md; register new error codes in docs/ERROR-CODES.md.
6. TWO-STRIKES rule applies. If scope must grow, stop and tell me.
7. When all slices are done, tell me to run `/ship`.
