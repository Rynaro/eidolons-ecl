#!/usr/bin/env bash
# envelope-verify.sh — reference SDK helper.
# Verify schema, integrity, and contract for a single envelope.
# Thin wrapper around conformance/check.sh.
#
# Usage:
#   envelope-verify.sh --envelope PATH [--artifact PATH] [--contracts DIR] [--json]
#
# If --artifact is omitted, the envelope's artifact.path is resolved
# relative to the envelope's directory.

set -u

ENVELOPE=""
ARTIFACT=""
CONTRACTS=""
JSON_FLAG=""

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --envelope)    ENVELOPE="$2"; shift 2 ;;
    --artifact)    ARTIFACT="$2"; shift 2 ;;
    --contracts)   CONTRACTS="$2"; shift 2 ;;
    --json)        JSON_FLAG="--json"; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$ENVELOPE" ]; then
  echo "Required: --envelope" >&2
  exit 1
fi
if [ ! -r "$ENVELOPE" ]; then
  echo "Cannot read envelope: $ENVELOPE" >&2
  exit 1
fi

SDK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SDK_DIR/../.." && pwd)"
CHECK="$REPO_ROOT/conformance/check.sh"

CONTRACTS_FLAG=""
if [ -n "$CONTRACTS" ]; then
  CONTRACTS_FLAG="--contracts $CONTRACTS"
fi

# If the artifact lives elsewhere, symlink/copy is the caller's job — the
# checker resolves artifact.path relative to the envelope directory.
# We exec the checker on just this envelope.
# shellcheck disable=SC2086
exec bash "$CHECK" "$ENVELOPE" $CONTRACTS_FLAG $JSON_FLAG
