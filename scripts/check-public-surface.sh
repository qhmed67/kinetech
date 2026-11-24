#!/usr/bin/env bash
# check-public-surface.sh — guard what this PUBLIC repository may contain.
#
# This repository is public. It may hold application code. It may NOT hold:
#   * credentials of any kind (API keys, tokens, private keys, JWTs),
#   * real infrastructure identifiers (project refs, account ids, lesson ids),
#   * owner-only documents (operational maps, weakness notes, checklists),
#   * personal data that is not already published by the product itself.
#
# The script never prints a matched value: it reports "path:line:type" only.
#
# Usage:
#   scripts/check-public-surface.sh            # scan every tracked file
#   scripts/check-public-surface.sh --staged   # scan the files staged for commit
#
# Identifiers that must not appear (real values) come from two optional
# sources, one literal per line:
#   * $HOME/kinetech-private/blocklist.txt   (local, untracked, optional)
#   * $PUBLIC_SURFACE_BLOCKLIST              (CI secret, optional)
# The script itself contains no real identifier.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "check-public-surface: not a git repo"; exit 2; }

MODE="all"
case "${1:-}" in
  --staged) MODE="staged" ;;
  --all)   MODE="all" ;;
  "")      MODE="all" ;;
  *)       echo "usage: $0 [--staged|--all]"; exit 2 ;;
esac

# ---------------------------------------------------------------------------
# 1. Owner-only paths: never tracked, never staged.
# ---------------------------------------------------------------------------
BLACKLIST=(
  "AGENTS.md"
  "docs/SYSTEM.md"
  "docs/HANDOFF.md"
  "docs/MANUAL-TODO.md"
  "docs/PLAYER-INVESTIGATION-HANDOFF.md"
  "docs/R2-WORKER-SETUP.md"
  "docs/video-pipeline-spec.md"
  "docs/ERROR-CODES.md"
  "docs/PRODUCT-RULES.md"
  "docs/USE-DOCUMENTATION.md"
  "docs/STABLE-VERSION.md"
  "docs/mobile/"
  "newPLanV2.md"
  "problem-v1.md"
  "react-native-plan-full.md"
  "session-"
  ".opencode/"
  ".agents/"
  "opencode.json"
  "skills-lock.json"
  "books/"
)

# ---------------------------------------------------------------------------
# 2. Secret shapes. Long enough not to fire on documented placeholders.
# ---------------------------------------------------------------------------
PATTERNS=(
  "google_api_key|AIza[0-9A-Za-z_-]{20,}"
  "supabase_pat|sbp_[A-Za-z0-9]{20,}"
  "supabase_secret|sb_secret_[A-Za-z0-9_-]{20,}"
  "github_token|ghp_[A-Za-z0-9]{20,}"
  "github_pat|github_pat_[A-Za-z0-9_]{20,}"
  "private_key_block|-----BEGIN [A-Z ]*PRIVATE KEY-----[ \\t]*[\\r\\n]+[A-Za-z0-9+/=]{40,}"
  "jwt|eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}"
)

# Files that legitimately contain a pattern as TEXT (the scanners themselves,
# or a test asserting a scanner). They are never scanned.
ALLOW=(
  "scripts/check-public-surface.sh"
  "apps/web/scripts/check-bundle-secrets.cjs"
  "apps/web/src/lib/clientEnv.test.ts"
)

fail=0
report() { printf '%s\n' "$1"; fail=1; }

is_allowed() {
  local f="$1" a
  for a in "${ALLOW[@]}"; do [ "$f" = "$a" ] && return 0; done
  return 1
}

# The file list to inspect -------------------------------------------------
if [ "$MODE" = "staged" ]; then
  mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACMR)
else
  mapfile -t FILES < <(git ls-files)
fi

# 1) blacklisted tracked/staged paths ---------------------------------------
for f in "${FILES[@]}"; do
  [ -z "$f" ] && continue
  for b in "${BLACKLIST[@]}"; do
    case "$f" in
      "$b"|"$b"*) report "$f:blacklisted_path" ;;
    esac
  done
done

# 2) secret shapes ----------------------------------------------------------
for f in "${FILES[@]}"; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  is_allowed "$f" && continue
  for entry in "${PATTERNS[@]}"; do
    type="${entry%%|*}"
    regex="${entry#*|}"
    # -I skips binary files; -o/-n print only the line number.
    while IFS= read -r ln; do
      [ -z "$ln" ] && continue
      report "$f:$ln:$type"
    done < <(grep -nIEo "$regex" "$f" 2>/dev/null | cut -d: -f1)
  done
done

# 3) real identifiers from the blocklists -----------------------------------
collect_literals() {
  local src="$1"
  [ -n "$src" ] || return 0
  # shellcheck disable=SC1090
  printf '%s\n' "$src" | sed -e 's/\r$//' -e 's/[[:space:]]*$//' | grep -v '^$' | grep -v '^#'
}

LITERALS=()
if [ -r "${HOME:-}/kinetech-private/blocklist.txt" ]; then
  while IFS= read -r lit; do [ -n "$lit" ] && LITERALS+=("$lit"); done < <(collect_literals "<${HOME}/kinetech-private/blocklist.txt")
fi
if [ -n "${PUBLIC_SURFACE_BLOCKLIST:-}" ]; then
  while IFS= read -r lit; do [ -n "$lit" ] && LITERALS+=("$lit"); done < <(collect_literals "$PUBLIC_SURFACE_BLOCKLIST")
fi

if [ "${#LITERALS[@]}" -gt 0 ]; then
  for f in "${FILES[@]}"; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || continue
    is_allowed "$f" && continue
    for lit in "${LITERALS[@]}"; do
      while IFS= read -r ln; do
        [ -z "$ln" ] && continue
        report "$f:$ln:blocklisted_value"
      done < <(grep -nIFo -- "$lit" "$f" 2>/dev/null | cut -d: -f1)
    done
  done
fi

if [ "$fail" -eq 0 ]; then
  echo "check-public-surface: OK (${#FILES[@]} file(s), mode=$MODE)"
else
  echo "check-public-surface: FAILED (mode=$MODE)"
fi
exit "$fail"
