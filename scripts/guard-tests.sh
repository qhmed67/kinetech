#!/usr/bin/env bash
# Fails if the diff (vs base) weakens tests: deleted test files, added skip/only/xfail markers,
# or a test file that loses more assertions than it gains.
# A human can bypass deliberately with ALLOW_TEST_CHANGES=1 (the opencode plugin blocks agents from setting it).
set -uo pipefail
[ "${ALLOW_TEST_CHANGES:-0}" = 1 ] && { echo "guard-tests: bypassed by human (ALLOW_TEST_CHANGES=1)"; exit 0; }
git rev-parse --verify HEAD >/dev/null 2>&1 || { echo "guard-tests: no commits yet; skipping"; exit 0; }
base="${GUARD_BASE:-$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)}"

TEST_RE='(^|/)(tests?|__tests__|spec)/|\.(test|spec)\.[a-z]+$|_test\.(go|py|dart|rs)$|(^|/)test_[^/]+\.py$'
SKIP_RE='\.skip\(|\bxit\(|\bxdescribe\(|\bxtest\(|\.only\(|@pytest\.mark\.(skip|xfail)|pytest\.skip\(|\bt\.Skip(f|Now)?\(|@Ignore|@Disabled|skip:[[:space:]]*true'
ASSERT_RE='\bassert|expect\(|\.should|\bt\.(Error|Fatal)f?\(|\brequire\.|assertThat|verify\('
fail=0

while IFS= read -r f; do
  echo "GUARD: test file deleted: $f"; fail=1
done < <(git diff --name-only --diff-filter=D "$base" | grep -E "$TEST_RE" || true)

while IFS= read -r f; do
  [ -f "$f" ] || continue
  d="$(git diff -U0 "$base" -- "$f")"
  if printf '%s\n' "$d" | grep -E '^\+[^+]' | grep -qE "$SKIP_RE"; then echo "GUARD: skip/only/xfail added in $f"; fail=1; fi
  rem=$(printf '%s\n' "$d" | grep -E '^-[^-]' | grep -cE "$ASSERT_RE" || true)
  add=$(printf '%s\n' "$d" | grep -E '^\+[^+]' | grep -cE "$ASSERT_RE" || true)
  if [ "$rem" -gt "$add" ]; then echo "GUARD: assertions decreased in $f (-$rem/+$add)"; fail=1; fi
done < <({ git diff --name-only --diff-filter=M "$base"; } | grep -E "$TEST_RE" || true)

# new untracked test files with skip markers
while IFS= read -r f; do
  grep -qE "$SKIP_RE" "$f" 2>/dev/null && { echo "GUARD: skip/only/xfail in new test $f"; fail=1; }
done < <(git ls-files --others --exclude-standard | grep -E "$TEST_RE" || true)

if [ "$fail" -ne 0 ]; then
  echo "guard-tests: FAILED. Tests must not be weakened. If the BEHAVIOR was intentionally changed, a human re-runs with ALLOW_TEST_CHANGES=1."; exit 1
fi
echo "guard-tests: OK"
