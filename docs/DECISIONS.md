# Decision log (ADRs)
Short on purpose. Add an entry when you: add a dependency, a pattern, a module, a schema/contract change, or deviate from docs/ARCHITECTURE.md. Never rewrite old entries — supersede them.
Agents: read this before proposing anything new; do not re-open a decided topic without saying which ADR you are challenging.

## Template
```
## ADR-NNN: <title>            Status: proposed | accepted | superseded by ADR-MMM
Date: YYYY-MM-DD
Context: <1-3 lines: the problem and constraints>
Decision: <what we do>
Rejected: <alternatives and why not>
Consequences: <what gets easier / harder; what drift would look like>
Enforced by: <test, lint rule, or "convention only">
```

## ADR-001: Layered architecture with enforced boundaries            Status: accepted
Date: <fill>
Context: AI-assisted changes tend to cross boundaries and accumulate inconsistent patterns.
Decision: Clean/hexagonal layering per module (docs/ARCHITECTURE.md), enforced by an `arch` check in `scripts/verify.sh` and CI.
Rejected: Convention-only rules (agents and humans drift without a failing check).
Consequences: Small upfront setup per stack; boundary violations fail the build.
Enforced by: `arch` step in verify + CI.

## ADR-002: One verification gate                                  Status: accepted
Date: <fill>
Context: "Done" must mean the same thing for humans, agents and CI.
Decision: `scripts/verify.sh` is the single gate (lint, types, arch, tests, build). CI runs exactly it.
Rejected: Separate ad-hoc commands per stack and per person.
Consequences: New stacks must plug into verify before feature work.
Enforced by: CI required check on main.
