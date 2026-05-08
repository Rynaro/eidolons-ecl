#!/usr/bin/env bash
# trace-tail.sh — reference SDK helper.
# Tail a thread trace JSONL with optional jq filters.
#
# Usage:
#   trace-tail.sh [--trace-dir DIR] [--thread THREAD_ID] [--from EIDOLON] [--to EIDOLON] [--follow]
#
# Examples:
#   # All trace lines for one thread:
#   trace-tail.sh --thread 01926e3a-...-...
#
#   # Tail-and-follow events flowing into VIGIL:
#   trace-tail.sh --to vigil --follow
#
#   # All emits in the last hour, pretty-printed:
#   trace-tail.sh | jq 'select(.event == "emit") | {ts, from, to, performative}'

set -u

TRACE_DIR=".eidolons/.trace"
THREAD=""
FROM=""
TO=""
FOLLOW=0

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --trace-dir) TRACE_DIR="$2"; shift 2 ;;
    --thread)    THREAD="$2";    shift 2 ;;
    --from)      FROM="$2";      shift 2 ;;
    --to)        TO="$2";        shift 2 ;;
    --follow)    FOLLOW=1;       shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ ! -d "$TRACE_DIR" ]; then
  echo "Trace dir not found: $TRACE_DIR" >&2
  exit 1
fi

if [ -n "$THREAD" ]; then
  FILES=("$TRACE_DIR/$THREAD.jsonl")
else
  FILES=()
  while IFS= read -r f; do FILES+=("$f"); done < <(find "$TRACE_DIR" -type f -name '*.jsonl' | LC_ALL=C sort)
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No trace files in $TRACE_DIR" >&2
  exit 1
fi

# Build jq filter from flags.
JQ_FILTER='.'
if [ -n "$FROM" ]; then
  JQ_FILTER="$JQ_FILTER | select(.from | startswith(\"$FROM@\"))"
fi
if [ -n "$TO" ]; then
  JQ_FILTER="$JQ_FILTER | select(.to | startswith(\"$TO@\"))"
fi

if [ "$FOLLOW" -eq 1 ]; then
  # tail -f (-F if many) into jq.
  tail -F "${FILES[@]}" 2>/dev/null | jq -c "$JQ_FILTER"
else
  cat "${FILES[@]}" | jq -c "$JQ_FILTER"
fi
