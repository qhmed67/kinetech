# Architecture — rules, not a tour
Loaded in EVERY session. Keep under ~120 lines. Fill the module map via `/bootstrap`.

## Shape
```
presentation + infrastructure  ──►  application  ──►  domain
        (adapters)                  (use cases)       (business rules)
```
Arrows mean "may import". Never the reverse. Ports (interfaces) are defined in domain/application and implemented in infrastructure.

| Layer | Contains | May import | Must NOT contain |
|---|---|---|---|
| domain | entities, value objects, domain errors, pure rules, ports | itself, std lib | frameworks, ORM, HTTP, UI, logger, env, direct clock/random/uuid |
| application | use cases, orchestration, transactions | domain | HTTP types, SQL, UI, framework objects |
| infrastructure | DB repos, external API clients, queues, files, logger implementation | application, domain | business rules |
| presentation | HTTP routes/controllers, CLI, UI screens/widgets/components, serializers | application (+ domain types) | business rules, DB access, direct external calls |

## Organize by business capability, layers INSIDE each module
```
<module>/            e.g. orders/, billing/, auth/
  domain/
  application/
  infrastructure/
  presentation/      (or api/ ui/ — whatever the stack calls it)
  index | __init__ | public API file   <- the ONLY thing other modules import
```
Stack examples: Python `app/orders/domain/...`; TypeScript `src/orders/domain/...`; Flutter `lib/features/orders/{domain,data,presentation}` (data = infrastructure); Go `internal/orders/{domain,app,adapters}`.

## Thin-module clause (stay pragmatic)
A pure CRUD module with no business rules may skip `application/` and let presentation call a repository interface directly. The dependency DIRECTION rule still applies. Do not create layers/classes that only forward calls. Add a layer when the first real rule appears.

## Rules
1. One business rule, one place. Search before writing; never duplicate logic across modules.
2. Map at boundaries: DB rows, HTTP bodies and external payloads become domain/application types at the adapter edge. Never pass ORM models or request objects inward.
3. Errors: domain throws/returns typed domain errors. Adapters translate them to HTTP codes / UI messages. Each has a code in docs/ERROR-CODES.md.
4. Transactions and orchestration live in application. Domain stays pure and synchronous where possible.
5. Inject time, randomness, ids, config and I/O (via ports/parameters). No hidden globals or singletons with state.
6. Modules talk through public interfaces or events. No circular dependencies between modules. If A and B need each other, extract the shared concept or use an event.
7. `shared/` / `common/` / `utils/` is for tiny, stateless, business-agnostic helpers only. It is not a dumping ground. Business concepts never go there.
8. Cross-stack contracts (API <-> web/mobile): one source of truth (OpenAPI / JSON Schema / protobuf). Generate or validate types from it. Contract change = level L3, additive first (add, migrate consumers, then remove).
9. Follow the nearest existing example for naming, folder layout and patterns. Consistency beats your preference.
10. Config via environment, validated at startup, fail fast. Never read env vars deep inside business code.

## Module map (fill / keep current)
| Module | Stack / dir | Owns (one line) | Public API | Depends on |
|---|---|---|---|---|
| <name> | <dir> | <what it is responsible for> | <file or package> | <modules> |

## Stop signs — if you are about to do one, STOP and ask
- Import that crosses a layer or module boundary the wrong way.
- A "manager"/"helper"/"util"/"service" that does many unrelated things.
- Copy-pasting a feature instead of extracting the shared part.
- Putting logic in a controller/widget "just this once".
- Adding a dependency, folder convention or pattern nobody asked for.
- Editing an arch rule, lint rule or CI step to make it pass.
- Rewriting a module to fix a bug in one function.

## Enforcement
These rules are checked by the `arch` step in `scripts/verify.sh` (see skill `setup-guardrails`). If the check does not exist yet for a stack, creating it is the FIRST task for that stack.
