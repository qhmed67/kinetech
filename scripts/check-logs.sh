#!/usr/bin/env bash
# Validate a JSONL log file against docs/LOGGING.md (python3, no deps). Use in an integration test after exercising the app.
exec python3 "$(dirname "${BASH_SOURCE[0]}")/logs.py" check "$@"
