#!/usr/bin/env bash
# Best-effort architecture check for stacks without a real boundary tool (Dart, Rust, PHP, ...).
# Prefer dependency-cruiser / import-linter / ArchUnit / depguard when available.
# Rules file `.arch-rules` (current dir), one per line:  <path-regex> :: <forbidden-import-regex> :: <message>   (regexes are ERE, `|` allowed inside them)
# Diff-aware: only files changed vs base are checked (legacy debt is not flagged until touched). GUARD_ALL=1 checks everything.
set -uo pipefail
[ -f .arch-rules ] || { echo "no .arch-rules here; skipping"; exit 0; }

changed_files() {
  if [ "${GUARD_ALL:-0}" = 1 ] || ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard; return
  fi
  local base="${GUARD_BASE:-$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)}"
  { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } | sort -u
}
IMPORT_LINE='^[[:space:]]*((import|from|use|using|require|#include|export)[[:space:](]|([A-Za-z_.]+[[:space:]]+)?"[^"]+"[[:space:]]*$)|require\('
FILES="$(changed_files)"; fail=0
while IFS= read -r line; do
  [[ -z "${line// }" || "$line" == \#* ]] && continue
  dir_re="$(sed 's/ *:: .*//' <<<"$line")"; rest="${line#*:: }"
  bad_re="$(sed 's/ *:: .*//' <<<"$rest")"; msg="${rest#*:: }"
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    hits="$(grep -nE "$IMPORT_LINE" "$f" 2>/dev/null | grep -E "$bad_re" || true)"
    if [ -n "$hits" ]; then
      echo "ARCH VIOLATION: $f — $msg"; echo "$hits" | sed 's/^/    /'; fail=1
    fi
  done < <(printf '%s\n' "$FILES" | grep -E "$dir_re" || true)
done < .arch-rules
[ "$fail" -eq 0 ] && echo "arch-grep: OK" || { echo "arch-grep: FAILED (fix the import; do not edit .arch-rules)"; exit 1; }
