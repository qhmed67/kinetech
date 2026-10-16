---
name: fix-bug
description: Use when debugging a bug, error, crash, failing test, wrong behavior, stack trace, log line, error code or correlation id. Log-driven, test-first root-cause procedure that keeps the fix small.
---
# Fix a bug (log-driven, test-first, minimal)

## 0. Do not start by editing
Reproduce and understand first. Fixing symptoms is how codebases rot.

## 1. Locate with logs
- Have a correlation id? `scripts/logs.sh trace <id>` shows the whole request path.
- Have an error code? `scripts/logs.sh code <CODE>`, then find its row in docs/ERROR-CODES.md and `grep` the code in source.
- Nothing yet? `scripts/logs.sh summary` then `scripts/logs.sh errors 50`.
- Read the `error.cause`, `module`, `event` and `ctx` fields. They tell you WHERE and WHY; confirm in the code.
- No usable logs at the failure point? Note it: improving that log line is part of the fix (step 6).

## 2. Reproduce with a failing test
Write the smallest test that fails for the reported reason, at the lowest layer where the bug lives (domain > application > adapter). Run it and SEE it fail. If you cannot reproduce, say so and list what you tried; do not guess-fix.

## 3. Root cause, one sentence
State: "X happens because Y in <file>:<function>". If you can't, gather more evidence (logs, a debug run) instead of trying random changes.

## 4. Minimal fix
Change the fewest lines that remove the root cause, inside the module that owns the behavior. No refactors, renames or cleanups in the same change. Keep architecture rules (layer direction, public interfaces).

## 5. Verify
Run the new test (green), then `scripts/verify.sh`. Confirm that other tests were not edited to pass.

## 6. Make the next bug cheaper
- If diagnosis was hard, add/improve the structured log (event, error.code, cause, ctx) per docs/LOGGING.md and register the code in docs/ERROR-CODES.md.
- Never log secrets/PII.

## Stop conditions
- Same failure after 2 fix attempts: STOP, revert to last green, report findings and options (AGENTS.md rule 11).
- Fix needs a contract/schema change or a second module: escalate to L2/L3 and say so.
- Unrelated bugs found: list them at the end; do not fix them now.
