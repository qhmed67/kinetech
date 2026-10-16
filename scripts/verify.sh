#!/usr/bin/env bash
# THE gate. Humans, agents, git hooks and CI all run this exact script.
# Usage: scripts/verify.sh [quick|full]     quick = no build step
# Fails closed: if no check could run, it fails (so a misconfigured repo is never "green").
set -uo pipefail
MODE="${1:-full}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FAILED=(); RAN=0

run() { local name="$1"; shift; RAN=$((RAN+1)); printf '▶ %s\n' "$name"
  if "$@"; then printf '✔ %s\n' "$name"; else printf '✘ %s\n' "$name"; FAILED+=("$name"); fi; }
guard() { local name="$1"; shift; printf '▶ %s\n' "$name"
  if "$@"; then printf '✔ %s\n' "$name"; else printf '✘ %s\n' "$name"; FAILED+=("$name"); fi; }
have() { command -v "$1" >/dev/null 2>&1; }
npm_has() { node -e "const s=(require('./package.json').scripts)||{};process.exit(s['$1']?0:1)" 2>/dev/null; }

verify_dir() {
  local dir="$1" L="[$1]"
  pushd "$dir" >/dev/null || { FAILED+=("$L directory missing"); return; }

  if [ -f package.json ] && have node; then
    local pm=npm; [ -f pnpm-lock.yaml ] && pm=pnpm; [ -f yarn.lock ] && pm=yarn
    for s in lint typecheck arch; do npm_has "$s" && run "$L $s" $pm run "$s"; done
    npm_has test && run "$L test" $pm run test
    [ "$MODE" = full ] && npm_has build && run "$L build" $pm run build
  fi

  if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
    have ruff && run "$L ruff" ruff check .
    if have mypy && { [ -f mypy.ini ] || grep -qs '\[tool.mypy\]' pyproject.toml; }; then run "$L mypy" mypy .; fi
    if have lint-imports && { [ -f .importlinter ] || grep -qs 'importlinter' pyproject.toml; }; then run "$L arch (import-linter)" lint-imports; fi
    have pytest && run "$L pytest" pytest -q
  fi

  if [ -f go.mod ] && have go; then
    run "$L go vet" go vet ./...
    have golangci-lint && { [ -f .golangci.yml ] || [ -f .golangci.yaml ]; } && run "$L golangci-lint" golangci-lint run
    run "$L go test" go test ./...
    [ "$MODE" = full ] && run "$L go build" go build ./...
  fi

  if [ -f pubspec.yaml ]; then
    if grep -qs flutter pubspec.yaml && have flutter; then run "$L flutter analyze" flutter analyze; run "$L flutter test" flutter test
    elif have dart; then run "$L dart analyze" dart analyze; run "$L dart test" dart test; fi
  fi

  if [ -f Cargo.toml ] && have cargo; then
    have cargo-clippy && run "$L clippy" cargo clippy -- -D warnings
    run "$L cargo test" cargo test
  fi

  [ -f .arch-rules ] && run "$L arch (.arch-rules)" bash "$ROOT/scripts/arch-grep.sh"
  popd >/dev/null
}

DIRS=(.)
if [ -f .verify-dirs ]; then
  mapfile -t DIRS < <(grep -vE '^\s*(#|$)' .verify-dirs)
fi
for d in "${DIRS[@]}"; do verify_dir "$d"; done

# Repo-wide guards (diff-aware: legacy code is only checked when touched)
[ -f scripts/guard-tests.sh ]       && guard "guard: tests not weakened"            bash scripts/guard-tests.sh
[ -f scripts/check-error-codes.sh ] && guard "guard: error codes + no print-logging" bash scripts/check-error-codes.sh

echo "------------------------------------------------------------"
if [ "$RAN" -eq 0 ]; then
  echo "VERIFY FAILED: no stack checks ran (guards alone do not count). Configure stacks in .verify-dirs / package scripts (see skill setup-guardrails)."; exit 1
fi
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "VERIFY FAILED (${#FAILED[@]} failed; $RAN stack checks ran):"; printf '  - %s\n' "${FAILED[@]}"; exit 1
fi
echo "VERIFY OK ($RAN checks, mode=$MODE)"
