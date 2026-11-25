#!/usr/bin/env bash
# Merge PR #39 ONLY if every gate is green.
#
# Verification performed by THIS script, immediately before merging:
#   1. GitHub CI checks on the PR head are all SUCCESS
#   2. The PR is MERGEABLE / CLEAN
#   3. The local gates pass on the identical tree:
#        typecheck (mobile), build (web), lint (0 errors), test:unit
#
# If any check fails the script exits non-zero and merges nothing.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"

PR=39
FAILED=0

say() { printf '\n=== %s ===\n' "$1"; }

say "0. toolchain"
node -v

say "1. GitHub CI on the PR head"
CI_OUT="$(gh pr checks "$PR" --json name,state -q '.[] | "\(.state) \(.name)"' 2>&1)"
echo "$CI_OUT"
if echo "$CI_OUT" | grep -qvE '^SUCCESS '; then
  echo "-> not all checks SUCCESS"
  FAILED=1
fi

say "2. PR mergeability"
STATE="$(gh pr view "$PR" --json mergeable,mergeStateStatus,headRefOid \
  -q '"\(.mergeable) \(.mergeStateStatus) \(.headRefOid)"' 2>&1)"
echo "$STATE"
MERGEABLE="$(echo "$STATE" | awk '{print $1}')"
MSTATE="$(echo "$STATE" | awk '{print $2}')"
HEAD_SHA="$(echo "$STATE" | awk '{print $3}')"
[ "$MERGEABLE" = "MERGEABLE" ] || { echo "-> not MERGEABLE"; FAILED=1; }
[ "$MSTATE" = "CLEAN" ] || { echo "-> state not CLEAN"; FAILED=1; }

say "3. local gates (on the balanced tree for $HEAD_SHA)"
npm run typecheck -w @kinetech/mobile >/dev/null 2>&1 \
  && echo "typecheck (mobile): PASS" || { echo "typecheck (mobile): FAIL"; FAILED=1; }
npm run build -w @kinetech/web >/dev/null 2>&1 \
  && echo "build (web): PASS" || { echo "build (web): FAIL"; FAILED=1; }
if npm run lint >/dev/null 2>&1; then
  echo "lint: PASS (0 errors)"
else
  echo "lint: FAIL"; FAILED=1
fi
npm run test:unit >/dev/null 2>&1 \
  && echo "test:unit: PASS" || { echo "test:unit: FAIL"; FAILED=1; }

if [ "$FAILED" -ne 0 ]; then
  say "RESULT: gates NOT green — merging NOTHING"
  exit 1
fi

say "RESULT: all gates green — merging PR #$PR (squash)"
gh pr merge "$PR" --squash
