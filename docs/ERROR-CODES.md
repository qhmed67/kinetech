# Error code registry
Every error that can reach a log or a client has a stable code here. This file is the debugging index: code -> meaning -> where -> first thing to check.
Format: `<AREA>_<NNN>`. Never reuse or renumber a code. Add new ones at the end of their area.
Agents: when you add a failure path, add its row in the same change. When debugging, grep the code in this file AND in the source.

| Code | Meaning | Thrown in (module/file) | Likely cause | First check / fix hint |
|---|---|---|---|---|
| SYS_001 | Unhandled exception | presentation error handler | bug | find stack in logs by correlation_id, then reproduce with a test |
| SYS_002 | Config invalid or missing at startup | config loader | missing env var | compare env with `.env.example` |
| VAL_001 | Request validation failed | presentation | bad client input | `ctx.fields` lists the invalid fields |
| AUTH_001 | Not authenticated | auth middleware | missing/expired token | check token expiry; clock skew |
| AUTH_002 | Not authorized | application | permission rule | check role/permission rule in the use case |
| DB_001 | Database unavailable / timeout | infrastructure repo | connection pool, DB down | check DB health, pool size, slow query log |
| EXT_001 | External API failed | infrastructure client | provider outage, timeout, bad credentials | check provider status, `ctx.status`, retry policy |
| <AREA>_<NNN> | <meaning> | <where> | <cause> | <hint> |
