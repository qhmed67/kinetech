"""Reference logger (stdlib only). Emits exactly the schema in docs/LOGGING.md.
Copy to your infrastructure layer, e.g. app/infrastructure/logging.py. Call configure() once at startup.
Usage:
    from app.infrastructure.logging import log, correlation_id_var
    log("info", "order.created", "order created", module="orders.application", order_id="o_1")
    try: ...
    except ProviderError as e:
        log("error", "order.payment.failed", "payment rejected", module="orders.infrastructure", error=e, code="EXT_001", order_id="o_1")
"""
import contextvars, json, os, sys, traceback
from datetime import datetime, timezone

correlation_id_var: contextvars.ContextVar = contextvars.ContextVar("correlation_id", default=None)
_cfg = {"service": "app", "env": "dev", "version": "0.0.0", "file": None, "min": "info"}
_ORDER = {"debug": 10, "info": 20, "warn": 30, "error": 40, "fatal": 50}
_SECRET_KEYS = ("password", "token", "secret", "authorization", "api_key", "apikey", "cookie", "card")


def configure(service: str, env: str = None, version: str = "0.0.0", level: str = None, file: str = None) -> None:
    _cfg.update(service=service, env=env or os.getenv("APP_ENV", "dev"), version=version,
                min=level or os.getenv("LOG_LEVEL", "info"),
                file=file if file is not None else ("logs/app.jsonl" if (env or os.getenv("APP_ENV", "dev")) == "dev" else None))
    if _cfg["file"]:
        os.makedirs(os.path.dirname(_cfg["file"]) or ".", exist_ok=True)


def _redact(d):
    if isinstance(d, dict):
        return {k: ("[REDACTED]" if any(s in k.lower() for s in _SECRET_KEYS) else _redact(v)) for k, v in d.items()}
    if isinstance(d, (list, tuple)):
        return [_redact(x) for x in d]
    return d


def log(level: str, event: str, msg: str, *, module: str, error: BaseException = None, code: str = None, **ctx) -> None:
    if _ORDER[level] < _ORDER[_cfg["min"]]:
        return
    rec = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
           "level": level, "service": _cfg["service"], "env": _cfg["env"], "version": _cfg["version"],
           "module": module, "event": event, "msg": msg}
    cid = correlation_id_var.get()
    if cid:
        rec["correlation_id"] = cid
    if error is not None or level in ("error", "fatal"):
        rec["error"] = {"code": code or "SYS_001", "type": type(error).__name__ if error else None,
                        "message": str(error) if error else msg,
                        "cause": repr(error.__cause__) if error is not None and error.__cause__ else None,
                        "stack": "".join(traceback.format_exception(type(error), error, error.__traceback__)) if error else None}
    if ctx:
        rec["ctx"] = _redact(ctx)
    line = json.dumps(rec, default=str, ensure_ascii=False)
    sys.stdout.write(line + "\n"); sys.stdout.flush()
    if _cfg["file"]:
        with open(_cfg["file"], "a", encoding="utf-8") as f:
            f.write(line + "\n")
