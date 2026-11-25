# Error code registry (public)

Every error that can reach a log or a client has a stable code. This file is
the public index of those codes: what the code means and which area raises it.

Format: `<AREA>_<NNN>`. Never reuse or renumber a code. Add new ones at the
end of their area. When you add a failure path, add its row in the same
change; the repository guard (`scripts/check-error-codes.sh`) fails otherwise.

This public list intentionally contains **no** environment-variable names, no
runtime configuration, no deployment state and no internal table names — those
live in the private operational notes.

| Code | Meaning | Area |
|---|---|---|
| SYS_001 | Unhandled exception | error handling |
| SYS_002 | Configuration missing or invalid | configuration |
| SYS_003 | A playback tier is not available on this deployment | playback |
| VAL_001 | Request validation failed | request handling |
| AUTH_001 | Not authenticated | authentication |
| AUTH_002 | Not authorized | authorization |
| AUTH_003 | Concurrent session limit reached | playback |
| AUTH_004 | Concurrent device limit reached | playback |
| APP_001 | The installed app build is older than the minimum supported version | native client |
| DB_001 | Database unavailable or timed out | data layer |
| EXT_001 | An external provider call failed | integrations |
| LOG_001 | Log shipping was rate limited | logging |
| <AREA>_<NNN> | <meaning> | <area> |
