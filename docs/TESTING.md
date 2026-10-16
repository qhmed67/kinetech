# Testing policy
Goal: a change that breaks something that worked must turn the build RED. Tests are the memory the next session does not have.

## Layers (most tests at the bottom)
| Layer | What | Speed / deps |
|---|---|---|
| Domain unit | pure rules, value objects | ms, no I/O, no mocks |
| Application | use cases using in-memory fakes of ports | fast, no network/DB |
| Adapter integration | repositories against a REAL DB (docker/testcontainers), API clients against recorded/stubbed servers | seconds |
| Contract | API schema <-> consumers (OpenAPI/JSON Schema validation) | fast |
| E2E | 3-10 critical user journeys only (login, checkout, ...) | slow, few |

## Rules
1. Test BEHAVIOR through the public interface, not private functions or call counts. A refactor that keeps behavior must not break tests.
2. Name tests as sentences: `rejects_order_when_stock_is_zero`.
3. Fake your own ports (in-memory repo). Do not mock your own domain. Mock only true external boundaries when a fake is impractical.
4. Every bug fix ships with a regression test that FAILED before the fix.
5. Characterization first: code with no tests that you must change gets a test pinning current behavior (even if ugly) before you edit it.
6. A new test must fail if the production code it covers is removed. If unsure, break the code temporarily and watch it fail.
7. Deterministic: inject clock/uuid/random; no sleeps; no test order dependence; no shared state between tests.
8. Flaky test = bug. Fix it or quarantine it with a tracked issue. Never "retry until green".
9. Never delete/skip/loosen a test to get green. Enforced: `scripts/guard-tests.sh` fails on deleted test files, added skip/only/xfail markers, and files that lose assertions. Only a human may bypass with `ALLOW_TEST_CHANGES=1`.
10. Coverage is a smell detector, not a goal. Domain and application logic should be near-fully covered; glue code need not be.
11. Optional, high value for the domain layer: mutation testing (Stryker for JS/TS, mutmut for Python, go-mutesting for Go) run occasionally, not on every commit.

## Gate contract (so `scripts/verify.sh` can run any stack)
Each stack directory must expose these commands; verify auto-detects common setups:
| Check | Node (package.json scripts) | Python | Go | Flutter/Dart |
|---|---|---|---|---|
| lint | `lint` | `ruff check .` | `go vet ./...` | `flutter analyze` |
| typecheck | `typecheck` | `mypy .` (if configured) | (compiler) | (analyzer) |
| arch | `arch` | `lint-imports` | golangci-lint depguard / `.arch-rules` | `.arch-rules` |
| test | `test` — MUST be non-watch (e.g. `vitest run`, `jest --ci`) | `pytest -q` | `go test ./...` | `flutter test` |
| build (full only) | `build` | — | `go build ./...` | — |

Test scripts must exit by themselves. A watch-mode test command hangs agents and CI.
