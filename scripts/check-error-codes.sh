#!/usr/bin/env bash
# (1) Every error code used in changed source (PREFIX_NNN, PREFIX registered in docs/ERROR-CODES.md) must have a row in the registry.
# (2) No print/console.log-style diagnostics in changed non-test source (use the project logger). Escape hatch on a line: allow-print
# Diff-aware like the other guards. GUARD_ALL=1 checks everything.
set -uo pipefail
REG="docs/ERROR-CODES.md"
changed_files() {
  if [ "${GUARD_ALL:-0}" = 1 ] || ! git rev-parse --verify HEAD >/dev/null 2>&1; then git ls-files --cached --others --exclude-standard; return; fi
  local base="${GUARD_BASE:-$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)}"
  { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } | sort -u
}
EXCL='(^|/)(tests?|__tests__|spec|templates|docs|scripts|node_modules|vendor|\.githooks|\.opencode|\.github)/|\.(test|spec)\.|_test\.|(^|/)test_'
SRC="$(changed_files | grep -E '\.(py|ts|tsx|js|jsx|mjs|go|dart|rs|java|kt)$' | grep -Ev "$EXCL" || true)"
[ -z "$SRC" ] && { echo "check-error-codes: no changed source files"; exit 0; }
fail=0

if [ -f "$REG" ]; then
  prefixes="$(grep -oE '^\|[[:space:]]*[A-Z]{2,6}_[0-9]{3}' "$REG" | grep -oE '[A-Z]{2,6}_' | sort -u | tr -d '_' | paste -sd'|' -)"
  if [ -n "$prefixes" ]; then
    while IFS= read -r f; do
      for code in $(grep -ohE "\b(${prefixes})_[0-9]{3}\b" "$f" 2>/dev/null | sort -u); do
        grep -qE "^\|[[:space:]]*${code}[[:space:]]*\|" "$REG" || { echo "ERRCODE: $code used in $f but not registered in $REG"; fail=1; }
      done
    done <<< "$SRC"
  fi
fi

while IFS= read -r f; do
  case "$f" in
    *.py|*.dart)       re='(^|[^.[:alnum:]_])(print|debugPrint)\(' ;;
    *.ts|*.tsx|*.js|*.jsx|*.mjs) re='console\.(log|debug|info|warn|error)\(' ;;
    *.go)              re='fmt\.Print(ln|f)?\(' ;;
    *.rs)              re='(^|[^[:alnum:]_])(println|eprintln|dbg)!\(' ;;
    *.java|*.kt)       re='System\.(out|err)\.print' ;;
    *) continue ;;
  esac
  hits="$(grep -nE "$re" "$f" 2>/dev/null | grep -v 'allow-print' || true)"
  [ -n "$hits" ] && { echo "NO-PRINT: $f uses print-style logging; use the project logger (docs/LOGGING.md)"; echo "$hits" | sed 's/^/    /'; fail=1; }
done <<< "$SRC"

[ "$fail" -eq 0 ] && echo "check-error-codes: OK" || { echo "check-error-codes: FAILED"; exit 1; }
