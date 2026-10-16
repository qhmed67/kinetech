#!/usr/bin/env python3
"""Query and validate JSONL logs (stdlib only). Schema: docs/LOGGING.md.  File: $LOG_FILE or logs/app.jsonl
  logs.py errors [N]        last N error/fatal lines (default 50)
  logs.py trace <id>        every line of one request (correlation_id)
  logs.py code <CODE> [N]   occurrences of an error code
  logs.py event <name> [N]  occurrences of an event
  logs.py summary           error counts by code / module / event
  logs.py tail              follow the file (Ctrl-C to stop)
  logs.py check [file]      validate schema + error-code registry (exit 1 on problems)
"""
import json, os, re, sys, time, collections

FILE = os.environ.get("LOG_FILE", "logs/app.jsonl")
REQUIRED = ["ts", "level", "service", "env", "version", "module", "event", "msg"]
LEVELS = {"debug", "info", "warn", "error", "fatal"}
EVENT_RE = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+)+$")
CODE_RE = re.compile(r"^[A-Z]{2,6}_[0-9]{3}$")


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


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "help"
    if cmd == "check":
        return check(argv[2] if len(argv) > 2 else FILE)
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
