---
name: setup-guardrails
description: Use when setting up or repairing automated guardrails - architecture/boundary tests, lint and type checks, non-watch test commands, verify script wiring, CI - for any stack (Python, TypeScript/Node, Go, Flutter/Dart, others).
---
# Set up guardrails (minimum viable, per stack)

Goal: boundary violations and regressions turn the build RED automatically. Do the smallest version first; tighten later. Creating or changing these files is level L3 (opencode will ask for approval on guardrail files). Explain what you add and why.

## Order of value
1. Make `scripts/verify.sh` detect the stack and pass on the current code (a green baseline).
2. Architecture check (`arch`): layer direction + no framework imports in domain + no cycles.
3. Tests run non-interactively (no watch mode).
4. Lint and type checks at a strictness the current code already passes (ratchet up later, never down).
5. CI runs `scripts/verify.sh` (template at `.github/workflows/ci.yml`).

If existing code already violates the new rules, DO NOT fix everything now. Record current violations as an allow-list/baseline so only NEW violations fail, and list the debt in docs/ARCHITECTURE.md.

## Architecture check by stack (choose one real tool; fall back to `.arch-rules`)
| Stack | Tool | Wire into verify as |
|---|---|---|
| TypeScript / JS | dependency-cruiser (or eslint-plugin-boundaries) | npm script `arch` |
| Python | import-linter | `lint-imports` (auto-detected) |
| Go | golangci-lint `depguard` (+ `internal/` packages) | lint step, or `.arch-rules` |
| Java/Kotlin | ArchUnit | a normal test |
| Flutter/Dart, others | `.arch-rules` + `scripts/arch-grep.sh` (best-effort grep on import lines) | auto-detected |
| Polyglot repo | archtest / archfit (declarative boundary checkers) | optional layer above per-language tools |

### TypeScript: `.dependency-cruiser.cjs` (adapt paths to the repo)
```js
module.exports = {
  forbidden: [
    { name: "domain-is-pure", severity: "error",
      from: { path: "^src/[^/]+/domain" },
      to:   { path: "^src/[^/]+/(application|infrastructure|presentation)" } },
    { name: "application-no-adapters", severity: "error",
      from: { path: "^src/[^/]+/application" },
      to:   { path: "^src/[^/]+/(infrastructure|presentation)" } },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: { tsConfig: { fileName: "tsconfig.json" }, doNotFollow: { path: "node_modules" } },
};
```
package.json: `"arch": "depcruise src --config .dependency-cruiser.cjs"`

### Python: `.importlinter` (adapt root package)
```ini
[importlinter]
root_package = app
include_external_packages = True

[importlinter:contract:layers]
name = Layers point inward
type = layers
layers =
    app.presentation | app.infrastructure
    app.application
    app.domain

[importlinter:contract:domain-pure]
name = Domain has no framework imports
type = forbidden
source_modules = app.domain
forbidden_modules =
    sqlalchemy
    fastapi
    django
    flask
```
If modules own their layers (`app.orders.domain`), use one contract per module or `containers`; see import-linter docs.

### Fallback for anything else: `.arch-rules`
Format: `<path-regex> :: <forbidden-import-regex> :: <message>` — copy from `.arch-rules.example`. Best-effort only; prefer a real tool when one exists.

## Tests and lint
- Node: `"test": "vitest run"` (or `jest --ci`), never watch. Python: `pytest -q`. Go: `go test ./...`. Flutter: `flutter test`.
- Do not enable stricter lint/type rules than the code passes today; add them in a separate, reviewed change.

## Prove the guardrail works
For each new arch rule, temporarily add a violating import, run `scripts/verify.sh`, confirm it FAILS with a clear message, then remove the violation. A guardrail you have not seen fail is not a guardrail.

## Report
List: what was added, baseline status, known debt allow-listed, and the next guardrail to add.
