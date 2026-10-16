# Logging standard
Goal: for any bug, a log line tells you WHERE it happened, WHY, and which request/user flow it belongs to — in one query, no guessing.

## 1. Format: one JSON object per line (JSONL)
```json
{"ts":"2026-01-15T10:22:31.512Z","level":"error","service":"api","env":"prod","version":"1.4.2",
 "module":"orders.application","event":"order.payment.failed","msg":"payment provider rejected charge",
 "correlation_id":"req_8f3a1c","user_id":"u_123","duration_ms":842,
 "error":{"code":"PAY_002","type":"ProviderRejected","message":"card_declined","cause":"stripe:card_declined","stack":"..."},
 "ctx":{"order_id":"o_991","amount":4200,"currency":"EGP"}}
```
Required on every line: `ts, level, service, env, version, module, event, msg`.
Add when known: `correlation_id, user_id, duration_ms, ctx{}`. On errors: `error{code,type,message,cause,stack}`.
- `event` is a stable machine name `domain.entity.action` (never interpolate variables into it). `msg` is the human sentence.
- Variable data goes in `ctx`, never glued into `msg`.
- Field names are snake_case and identical in every stack.

## 2. Levels
| Level | Use for | Example |
|---|---|---|
| fatal | process cannot continue | cannot connect to DB at startup |
| error | an operation FAILED and someone should look | payment failed, unhandled exception |
| warn | recovered / degraded, may need attention | retry succeeded, fallback used, deprecated call |
| info | business milestones, one per important action | order created, user signed in, job finished |
| debug | developer detail; off in prod by default | computed values, branch taken |
Do not log expected user mistakes (validation failures) as `error`; use `info`/`warn` with a code.

## 3. Where to log (clean-architecture aware)
- domain: NEVER logs (it is pure). It returns/throws typed errors and events.
- application: log business milestones (`info`) at use-case boundaries and decisions that matter.
- infrastructure: log external calls (target, duration, outcome) and translate raw exceptions into typed errors WITH `cause`.
- presentation: request/response summary (method, route, status, duration), generate or read `correlation_id`, and be the single place that logs unhandled errors.
- Log an error ONCE where it is handled. Do not log-and-rethrow at every layer.

## 4. Correlation
- Generate `correlation_id` at the edge (HTTP middleware / job start / app action). Accept `X-Correlation-ID` if provided. Return it in the response header and in error payloads.
- Propagate it through async context (Python `contextvars`, Node `AsyncLocalStorage`, Go `context.Context`) so every log line inside a request carries it automatically.
- Mobile/web clients: send the id on every request; on client errors, report them to the backend with the same id.
- Service-to-service calls forward the header.

## 5. Never log
Passwords, tokens, API keys, session ids, full card numbers, national ids, raw request bodies with personal data. Mask emails/phones if needed. Use an allow-list for `ctx` on sensitive flows. Redaction is configured once in the logger, not per call.

## 6. Setup per stack (one logger module per service; everything imports it)
| Stack | Suggested library | Notes |
|---|---|---|
| Python | `structlog` (JSON renderer) | bind `correlation_id` via contextvars |
| Node/TS | `pino` | `AsyncLocalStorage` for context; `pino-pretty` only in dev |
| Go | `log/slog` JSON handler | pass logger via context |
| Flutter/Dart | `logger` or `logging` + remote reporter | send errors to backend with correlation id |
Rule: never `print` / `console.log` / `fmt.Println` for diagnostics.
Ready-made reference loggers that emit EXACTLY this schema (stdlib only, with correlation id + secret redaction): `templates/logging/logger.py` and `templates/logging/logger.ts`. Copy one into the infrastructure layer; for other stacks, port it (about 60 lines) and keep the same fields.

## 7. Where logs live
- Prod/staging: stdout -> your platform's collector (JSON stays JSON).
- Local dev: also `logs/app.jsonl` (gitignored; the reference loggers do this when env=dev).
- Query locally with `scripts/logs.sh` (python3, no other deps):
```
scripts/logs.sh errors 50          # last 50 errors
scripts/logs.sh trace req_8f3a1c   # everything for one request
scripts/logs.sh code PAY_002       # all occurrences of an error code
scripts/logs.sh event order.created
scripts/logs.sh summary            # error counts by code/module/event
scripts/logs.sh check              # validate the file against this schema
```

## 8. Definition of "well logged"
A new failure path is done when: it has an error code in docs/ERROR-CODES.md, it logs once with `error.code` + `cause` + useful `ctx`, and a test (or at least a manual run) shows the line appears with the correlation id.

## 9. Enforcement (what is checked by machines, not by good intentions)
| Check | Tool | When |
|---|---|---|
| No print/console.log in changed source | `scripts/check-error-codes.sh` | every `verify` |
| Every error code in changed source is registered in docs/ERROR-CODES.md | `scripts/check-error-codes.sh` | every `verify` |
| Emitted lines match the schema (fields, level, event name, error.code) and codes are registered | `scripts/check-logs.sh` | add one integration test that exercises the app then runs it |
Limits: static checks cannot prove a log line carries the right `ctx`; the reviewer checks that. A new area prefix (e.g. `PAY_`) must be added to the registry first, otherwise its codes are not recognized by the static check.
