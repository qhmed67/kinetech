#!/usr/bin/env python3
"""Query and validate JSONL logs (stdlib only). Schema: docs/LOGGING.md.

Legacy commands (local file: $LOG_FILE or logs/app.jsonl):
  logs.py errors [N]        last N error/fatal lines (default 50)
  logs.py trace <id>        every line of one request (correlation_id)
  logs.py code <CODE> [N]   occurrences of an error code
  logs.py event <name> [N]  occurrences of an event
  logs.py summary           error counts by code / module / event
  logs.py tail              follow the file (Ctrl-C to stop)
  logs.py check [file]      validate schema + error-code registry (exit 1 on problems)

Filter mode (any flag; use --source db for the app_logs table):
  logs.py --request req_abc --since 30m
  logs.py --level error --route /api/play --since 1h
  logs.py --source db --code SYS_001 --limit 50
  logs.py --file /tmp/run.jsonl --event ui.request.end

DB source reads env only: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Values are never printed or written to disk.
"""
import argparse, collections, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request

FILE = os.environ.get("LOG_FILE", "logs/app.jsonl")
REQUIRED = ["ts", "level", "service", "env", "version", "module", "event", "msg"]
LEVELS = {"debug", "info", "warn", "error", "fatal"}
EVENT_RE = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+)+$")
CODE_RE = re.compile(r"^[A-Z]{2,6}_[0-9]{3}$")
SINCE_RE = re.compile(r"^(\d+)([smhd])$")


def records(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield n, json.loads(line), line
            except json.JSONDecodeError:
                yield n, None, line


def registered_codes():
    try:
        txt = open("docs/ERROR-CODES.md", encoding="utf-8").read()
    except OSError:
        return None
    return set(re.findall(r"^\|\s*([A-Z]{2,6}_[0-9]{3})\s*\|", txt, re.M))


def emit(lines, n):
    for l in lines[-n:]:
        print(l)


def check(path):
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        print(f"check-logs: {path} missing or empty"); return 1
    problems, codes = [], set()
    total = 0
    for n, r, raw in records(path):
        total += 1
        if not isinstance(r, dict):
            problems.append(f"line {n}: not a JSON object"); continue
        miss = [k for k in REQUIRED if r.get(k) is None]
        if miss: problems.append(f"line {n}: missing fields: {','.join(miss)}")
        if r.get("level") not in LEVELS: problems.append(f"line {n}: bad level: {r.get('level')}")
        if not EVENT_RE.match(str(r.get("event", ""))): problems.append(f"line {n}: bad event name (want domain.entity.action): {r.get('event')}")
        if r.get("level") in ("error", "fatal"):
            code = (r.get("error") or {}).get("code", "")
            if not CODE_RE.match(str(code)): problems.append(f"line {n}: error-level line without valid error.code")
        c = (r.get("error") or {}).get("code") if isinstance(r.get("error"), dict) else None
        if c: codes.add(c)
    reg = registered_codes()
    if reg is not None:
        for c in sorted(codes - reg):
            problems.append(f"error code {c} is logged but not registered in docs/ERROR-CODES.md")
    if problems:
        print("check-logs: FAILED"); print("\n".join(problems[:30])); return 1
    print(f"check-logs: OK ({total} lines)"); return 0


def since_cutoff(value):
    m = SINCE_RE.match(str(value or ""))
    if not m:
        raise ValueError("use --since like 30m, 1h, 7d")
    unit = {"s": 1, "m": 60, "h": 3600, "d": 86400}[m.group(2)]
    when = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=int(m.group(1)) * unit)
    return when.isoformat().replace("+00:00", "Z")


def remote_lines(args):
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("db source needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (names only — values stay in env)")
        return None
    params = [("select", "*"), ("order", "ts.desc"), ("limit", str(max(1, min(args.limit, 500))))]
    if args.request: params.append(("correlation_id", "eq." + args.request))
    if args.level: params.append(("level", "eq." + args.level))
    if args.route: params.append(("ctx->>route", "eq." + args.route))
    if args.event: params.append(("event", "eq." + args.event))
    if args.code: params.append(("error->>code", "eq." + args.code))
    if args.since: params.append(("ts", "gte." + since_cutoff(args.since)))
    target = url + "/rest/v1/app_logs?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(target, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            rows = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # never leak the key or the full URL
        print(f"db query failed: {type(exc).__name__} (check env and app_logs migration)")
        return None
    if not isinstance(rows, list):
        print("db query failed: unexpected response")
        return None
    return [json.dumps(row, ensure_ascii=False, sort_keys=True) for row in reversed(rows)]


def query_mode(argv):
    p = argparse.ArgumentParser(prog="logs.py", description="Query structured logs")
    p.add_argument("--request", help="correlation_id")
    p.add_argument("--level", help="exact level")
    p.add_argument("--route", help="ctx.route, e.g. /api/play")
    p.add_argument("--event", help="exact event name")
    p.add_argument("--code", help="error.code")
    p.add_argument("--since", help="relative window: 30m, 1h, 7d")
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--source", choices=["file", "db"], default="file")
    p.add_argument("--file", help="local JSONL file (default $LOG_FILE or logs/app.jsonl)")
    args = p.parse_args(argv[1:])

    if args.source == "db":
        lines = remote_lines(args)
        if lines is None: return 1
    else:
        path = args.file or FILE
        if not os.path.isfile(path):
            print(f"no log file at {path} (set LOG_FILE=..., or use --source db)")
            return 1
        cutoff = since_cutoff(args.since) if args.since else None
        lines = []
        for _, rec, raw in records(path):
            if not isinstance(rec, dict): continue
            if args.request and rec.get("correlation_id") != args.request: continue
            if args.level and rec.get("level") != args.level: continue
            if args.event and rec.get("event") != args.event: continue
            if args.code and (rec.get("error") or {}).get("code") != args.code: continue
            if args.route and (rec.get("ctx") or {}).get("route") != args.route: continue
            if cutoff and str(rec.get("ts", "")) < cutoff: continue
            lines.append(raw)
    emit(lines, max(1, args.limit))
    return 0


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "help"
    if cmd == "check":
        path = argv[argv.index("--file") + 1] if "--file" in argv else (argv[2] if len(argv) > 2 and not argv[2].startswith("--") else FILE)
        return check(path)
    if any(a.startswith("--") for a in argv[1:]):
        return query_mode(argv)
    if cmd in ("help", "-h", "--help") or not os.path.isfile(FILE):
        if cmd not in ("help", "-h", "--help"): print(f"no log file at {FILE} (set LOG_FILE=...)")
        print(__doc__); return 0 if cmd in ("help", "-h", "--help") else 1
    recs = [(n, r, raw) for n, r, raw in records(FILE) if r is not None]
    if cmd == "errors":
        emit([raw for _, r, raw in recs if r.get("level") in ("error", "fatal")], int(argv[2]) if len(argv) > 2 else 50)
    elif cmd == "trace" and len(argv) > 2:
        emit([raw for _, r, raw in recs if r.get("correlation_id") == argv[2]], 10**9)
    elif cmd == "code" and len(argv) > 2:
        emit([raw for _, r, raw in recs if (r.get("error") or {}).get("code") == argv[2]], int(argv[3]) if len(argv) > 3 else 50)
    elif cmd == "event" and len(argv) > 2:
        emit([raw for _, r, raw in recs if r.get("event") == argv[2]], int(argv[3]) if len(argv) > 3 else 50)
    elif cmd == "summary":
        c = collections.Counter(((r.get("error") or {}).get("code", "NO_CODE"), r.get("module", "?"), r.get("event", "?"))
                                for _, r, _ in recs if r.get("level") in ("error", "fatal"))
        for (code, mod, ev), k in c.most_common(20): print(f"{k:5d}  {code}  {mod}  {ev}")
    elif cmd == "tail":
        with open(FILE, encoding="utf-8", errors="replace") as f:
            f.seek(0, 2)
            while True:
                l = f.readline()
                if l: print(l.rstrip())
                else: time.sleep(0.3)
    else:
        print(__doc__); return 1
    return 0


if __name__ == "__main__":
    try: sys.exit(main(sys.argv))
    except KeyboardInterrupt: sys.exit(0)
    except ValueError as exc:
        print(f"logs.py: {exc}"); sys.exit(2)
