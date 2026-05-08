#!/usr/bin/env bash
# handoff-emit.sh — reference SDK helper.
# Atomic emit: write envelope sidecar AND append a trace event.
#
# Usage:
#   handoff-emit.sh \
#     --artifact PATH \
#     --contract PATH \
#     --performative STR \
#     --objective STR \
#     [--trace-dir DIR]      # default: ./.eidolons/.trace
#     [...all envelope-build.sh flags]
#
# Side effects:
#   - Writes <artifact>.envelope.json next to the artifact.
#   - Appends one 'emit' event to <trace-dir>/<thread_id>.jsonl.

set -u

ARTIFACT=""
TRACE_DIR=""
PASSTHROUGH=()

while [ $# -gt 0 ]; do
  case "$1" in
    --artifact)
      ARTIFACT="$2"
      PASSTHROUGH+=("--artifact" "$2")
      shift 2
      ;;
    --trace-dir) TRACE_DIR="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      PASSTHROUGH+=("$1")
      shift
      ;;
  esac
done

if [ -z "$ARTIFACT" ]; then
  echo "Required: --artifact" >&2
  exit 1
fi
if [ ! -r "$ARTIFACT" ]; then
  echo "Cannot read artifact: $ARTIFACT" >&2
  exit 1
fi

if [ -z "$TRACE_DIR" ]; then TRACE_DIR=".eidolons/.trace"; fi
mkdir -p "$TRACE_DIR"

SDK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$SDK_DIR/envelope-build.sh"

ENVELOPE_PATH="${ARTIFACT}.envelope.json"

# Build envelope.
ENVELOPE_JSON="$(bash "$BUILD" "${PASSTHROUGH[@]}")"
if [ -z "$ENVELOPE_JSON" ]; then
  echo "envelope-build.sh produced empty output" >&2
  exit 2
fi
printf '%s\n' "$ENVELOPE_JSON" > "$ENVELOPE_PATH"

# Append trace event.
THREAD_ID="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.thread_id')"
MESSAGE_ID="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.message_id')"
FROM="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.from.eidolon + "@" + .from.version')"
TO="$(printf '%s' "$ENVELOPE_JSON"   | jq -r '.to.eidolon + "@" + .to.version')"
PERF="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.performative')"
INT_METHOD="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.integrity.method')"
TOKENS="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.context_delta.tokens_used // 0')"
MODEL="$(printf '%s' "$ENVELOPE_JSON" | jq -r '.trace.model')"
TIER="$(printf '%s'  "$ENVELOPE_JSON" | jq -r '.trace.tier')"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

TRACE_FILE="$TRACE_DIR/$THREAD_ID.jsonl"
jq -nc \
  --arg ts "$TS" \
  --arg event "emit" \
  --arg message_id "$MESSAGE_ID" \
  --arg thread_id  "$THREAD_ID" \
  --arg from "$FROM" \
  --arg to   "$TO" \
  --arg performative "$PERF" \
  --arg integrity_method "$INT_METHOD" \
  --argjson context_tokens "$TOKENS" \
  --arg model "$MODEL" \
  --arg tier "$TIER" \
  '{ts: $ts, event: $event, message_id: $message_id, thread_id: $thread_id,
    from: $from, to: $to, performative: $performative,
    integrity_method: $integrity_method,
    context_tokens: $context_tokens, model: $model, tier: $tier}' \
  >> "$TRACE_FILE"

echo "envelope: $ENVELOPE_PATH"
echo "trace:    $TRACE_FILE"
