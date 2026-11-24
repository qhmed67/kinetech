# Error code registry
Every error that can reach a log or a client has a stable code here. This file is the debugging index: code -> meaning -> where -> first thing to check.
Format: `<AREA>_<NNN>`. Never reuse or renumber a code. Add new ones at the end of their area.
Agents: when you add a failure path, add its row in the same change. When debugging, grep the code in this file AND in the source.

| Code | Meaning | Thrown in (module/file) | Likely cause | First check / fix hint |
|---|---|---|---|---|
| SYS_001 | Unhandled exception | presentation error handler | bug | find stack in logs by correlation_id, then reproduce with a test |
| SYS_002 | Config invalid or missing at startup | config loader | missing env var | compare env with `.env.example` |
| SYS_003 | Direct tier: DRIVE_BROWSER_KEY not set | api/play.ts | server env var missing on the deployment | set DRIVE_BROWSER_KEY and redeploy |
| VAL_001 | Request validation failed | presentation | bad client input | `ctx.fields` lists the invalid fields |
| AUTH_001 | Not authenticated | auth middleware | missing/expired token | check token expiry; clock skew |
| APP_001 | Native app version below minimum supported version | `api/play.ts` | client sent X-App-Version below native_gate.min_supported_version while force_update enabled | check app_settings.native_gate; confirm client headers; raise min only after new native build is released |
| AUTH_002 | Not authorized | application | permission rule | check role/permission rule in the use case |
| AUTH_003 | Too many concurrent sessions for one account | `api/play.ts` | `session_limits` is in `enforce` mode and the live session count is above the limit | check app_settings.session_limits (mode, max_concurrent_sessions, heartbeat_ttl_minutes); the live rows are in play_sessions |
| AUTH_004 | Too many concurrent devices for one account | `api/play.ts` | `session_limits` is in `enforce` mode and the live device count is above the limit | check app_settings.session_limits (mode, max_concurrent_devices); the live rows are in play_sessions |
| DB_001 | Database unavailable / timeout | infrastructure repo | connection pool, DB down | check DB health, pool size, slow query log |
| EXT_001 | External API failed | infrastructure client | provider outage, timeout, bad credentials | check provider status, `ctx.status`, retry policy |
| LOG_001 | Log upload rate limited | `api/log.ts` | too many client batches from one IP | check client ship rate; raise window only with owner approval |
| <AREA>_<NNN> | <meaning> | <where> | <cause> | <hint> |
