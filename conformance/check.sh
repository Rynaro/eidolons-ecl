#!/usr/bin/env bash
# ECL conformance checker.
#
# Usage:
#   bash check.sh <path> [options]
#
# <path> may be:
#   - A single *.envelope.json file
#   - A directory; the checker recursively validates every *.envelope.json
#     it finds.
#
# Options:
#   --contracts DIR         Path to the contracts/ directory. Default:
#                           <repo-of-this-script>/contracts.
#   --schemas DIR           Path to the schemas/ directory. Default:
#                           <repo-of-this-script>/schemas.
#   --level=MUST|SHOULD     Restrict reporting to checks at this level or
#                           stricter. Default: report all.
#   --json                  Emit machine-readable JSON instead of human
#                           [OK]/[FAIL]/[WARN] lines.
#   --target-version 1.0    ECL version to check against. Default: read
#                           from <consumer>/ECL_VERSION; fall back to 1.0.
#   -h, --help              Print this help and exit 0.
#
# Exit codes (ECL v2.0 §7):
#   0  Passes all MUSTs at the declared ECL_VERSION.
#   1  Generic failure (missing dir, unreadable files, bad usage).
#   2  Fails one or more MUSTs.
#   3  Passes MUSTs but fails one or more SHOULDs (advisory).
#   4  Passes MUSTs but emits warn-only output for grandfathered drifts.
#
# Bash 3.2 compatible. Hard deps: jq, bash, POSIX coreutils, shasum.
# Optional: ajv-cli or python -m jsonschema for full JSON Schema
# validation (falls back to structural field checks via jq).

set -u
# We deliberately do not `set -e`; we want to collect every check.

VERSION="2.1.0"

# -- option parsing --------------------------------------------------------- #

TARGET_PATH=""
CONTRACTS_DIR=""
SCHEMAS_DIR=""
LEVEL="ALL"
OUTPUT="human"
TARGET_VERSION=""

print_help() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --contracts)        CONTRACTS_DIR="$2"; shift 2 ;;
    --contracts=*)      CONTRACTS_DIR="${1#--contracts=}"; shift ;;
    --schemas)          SCHEMAS_DIR="$2"; shift 2 ;;
    --schemas=*)        SCHEMAS_DIR="${1#--schemas=}"; shift ;;
    --level=*)          LEVEL="${1#--level=}"; shift ;;
    --level)            LEVEL="$2"; shift 2 ;;
    --json)             OUTPUT="json"; shift ;;
    --target-version)   TARGET_VERSION="$2"; shift 2 ;;
    --target-version=*) TARGET_VERSION="${1#--target-version=}"; shift ;;
    -h|--help)          print_help; exit 0 ;;
    --version)          echo "$VERSION"; exit 0 ;;
    --)                 shift; break ;;
    -*)
      echo "Unknown option: $1" >&2
      echo "Run: bash $(basename "$0") --help" >&2
      exit 1
      ;;
    *)
      if [ -z "$TARGET_PATH" ]; then
        TARGET_PATH="$1"
      else
        echo "Unexpected extra argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$TARGET_PATH" ]; then
  echo "Usage: bash $(basename "$0") <path> [options]" >&2
  exit 1
fi

if [ ! -e "$TARGET_PATH" ]; then
  echo "Path not found: $TARGET_PATH" >&2
  exit 1
fi

# Normalise to absolute path.
if [ -d "$TARGET_PATH" ]; then
  TARGET_ABS="$(cd "$TARGET_PATH" && pwd)"
else
  TARGET_DIR="$(cd "$(dirname "$TARGET_PATH")" && pwd)"
  TARGET_ABS="$TARGET_DIR/$(basename "$TARGET_PATH")"
fi

# Resolve script home so we can find lib, default contracts and schemas.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "$CONTRACTS_DIR" ]; then CONTRACTS_DIR="$REPO_ROOT/contracts"; fi
if [ -z "$SCHEMAS_DIR" ];   then SCHEMAS_DIR="$REPO_ROOT/schemas"; fi

if [ ! -d "$CONTRACTS_DIR" ]; then
  echo "Contracts dir not found: $CONTRACTS_DIR" >&2
  exit 1
fi
if [ ! -d "$SCHEMAS_DIR" ]; then
  echo "Schemas dir not found: $SCHEMAS_DIR" >&2
  exit 1
fi

# -- target version resolution --------------------------------------------- #

if [ -z "$TARGET_VERSION" ]; then
  # Try to read ECL_VERSION near the target path.
  if [ -f "$TARGET_ABS/ECL_VERSION" ]; then
    TARGET_VERSION="$(head -n 1 "$TARGET_ABS/ECL_VERSION" | tr -d '[:space:]')"
  elif [ -f "$REPO_ROOT/ECL_VERSION" ]; then
    TARGET_VERSION="$(head -n 1 "$REPO_ROOT/ECL_VERSION" | tr -d '[:space:]')"
  fi
fi

if [ -z "$TARGET_VERSION" ]; then
  TARGET_VERSION="2.0"
fi

case "$TARGET_VERSION" in
  1.0|1.0.*|1)   : "v1.0 baseline" ;;
  1.*)           : "v1.x; running v1.x gates" ;;
  2.0|2.0.*|2)   : "v2.0; running v2.0 gates including ISE" ;;
  2.1|2.1.*)     : "v2.1 (Draft); per-envelope gates promote I-5/S-3 to MUST and add S-4 for 2.1 envelopes" ;;
  2.*)           : "future 2.x; running v2.x gates" ;;
  *)
    echo "Unsupported --target-version: $TARGET_VERSION (this checker knows 1.x, 2.0, 2.1)" >&2
    exit 1
    ;;
esac

# -- result accumulator ---------------------------------------------------- #

# Parallel arrays (bash 3.2 has no associative arrays).
RES_IDS=()
RES_NAMES=()
RES_LEVELS=()    # MUST | SHOULD | WARN
RES_STATUSES=()  # ok | fail | warn
RES_REASONS=()
RES_TARGETS=()   # which envelope file the result is about

ecl_record() {
  # ecl_record <id> <level> <status> <name> <reason?> <target?>
  RES_IDS+=("$1")
  RES_LEVELS+=("$2")
  RES_STATUSES+=("$3")
  RES_NAMES+=("$4")
  RES_REASONS+=("${5:-}")
  RES_TARGETS+=("${6:-}")
}

# -- library load ---------------------------------------------------------- #

LIB_DIR="$SCRIPT_DIR/lib"
if [ ! -d "$LIB_DIR" ]; then
  echo "Internal error: lib dir not found at $LIB_DIR" >&2
  exit 1
fi

# shellcheck source=lib/envelope.sh
. "$LIB_DIR/envelope.sh"
# shellcheck source=lib/integrity.sh
. "$LIB_DIR/integrity.sh"
# shellcheck source=lib/handoff-graph.sh
. "$LIB_DIR/handoff-graph.sh"
# shellcheck source=lib/context-budget.sh
. "$LIB_DIR/context-budget.sh"
# shellcheck source=lib/ise.sh
. "$LIB_DIR/ise.sh"

# -- collect envelopes ----------------------------------------------------- #

ENVELOPES=()
if [ -d "$TARGET_ABS" ]; then
  # Find envelopes; bash 3.2 can't readarray. Use while-read.
  while IFS= read -r f; do
    ENVELOPES+=("$f")
  done < <(find "$TARGET_ABS" -type f -name '*.envelope.json' | LC_ALL=C sort)
elif [ -f "$TARGET_ABS" ]; then
  case "$TARGET_ABS" in
    *.envelope.json) ENVELOPES+=("$TARGET_ABS") ;;
    *)
      echo "Not an envelope file: $TARGET_ABS" >&2
      exit 1
      ;;
  esac
fi

if [ "${#ENVELOPES[@]}" -eq 0 ]; then
  echo "No *.envelope.json files found under $TARGET_ABS" >&2
  exit 1
fi

# -- run checks per envelope ---------------------------------------------- #

i=0
n_env=${#ENVELOPES[@]}
while [ "$i" -lt "$n_env" ]; do
  env_path="${ENVELOPES[$i]}"
  ecl_check_envelope         "$env_path"
  ecl_check_integrity        "$env_path"
  ecl_check_handoff_graph    "$env_path" "$CONTRACTS_DIR"
  ecl_check_context_budget   "$env_path" "$CONTRACTS_DIR"
  ecl_check_ise              "$env_path"
  i=$((i + 1))
done

# -- summarise ------------------------------------------------------------- #

EXIT_CODE=0
HAS_MUST_FAIL=0
HAS_SHOULD_FAIL=0
HAS_WARN=0

i=0
n=${#RES_IDS[@]}
while [ "$i" -lt "$n" ]; do
  level="${RES_LEVELS[$i]}"
  status="${RES_STATUSES[$i]}"
  case "$status:$level" in
    fail:MUST)   HAS_MUST_FAIL=1 ;;
    fail:SHOULD) HAS_SHOULD_FAIL=1 ;;
    warn:*)      HAS_WARN=1 ;;
  esac
  i=$((i + 1))
done

if [ "$HAS_MUST_FAIL" -eq 1 ]; then
  EXIT_CODE=2
elif [ "$HAS_SHOULD_FAIL" -eq 1 ]; then
  EXIT_CODE=3
elif [ "$HAS_WARN" -eq 1 ]; then
  EXIT_CODE=4
else
  EXIT_CODE=0
fi

# -- emit ------------------------------------------------------------------ #

emit_human() {
  echo "ECL conformance check"
  echo "Target:        $TARGET_ABS"
  echo "Target ECL:    $TARGET_VERSION"
  echo "Envelopes:     $n_env"
  echo "Contracts:     $CONTRACTS_DIR"
  echo "Level filter:  $LEVEL"
  echo "----"
  i=0
  while [ "$i" -lt "$n" ]; do
    level="${RES_LEVELS[$i]}"
    status="${RES_STATUSES[$i]}"
    name="${RES_NAMES[$i]}"
    id="${RES_IDS[$i]}"
    reason="${RES_REASONS[$i]}"
    target="${RES_TARGETS[$i]}"

    if [ "$LEVEL" = "MUST" ] && [ "$level" = "SHOULD" ] && [ "$status" = "ok" ]; then
      i=$((i + 1)); continue
    fi

    case "$status" in
      ok)   tag="[OK]   " ;;
      fail) tag="[FAIL] " ;;
      warn) tag="[WARN] " ;;
      *)    tag="[?]    " ;;
    esac
    line="${tag}${id} ${level} ${name}"
    if [ -n "$target" ]; then line="${line} <$(basename "$target")>"; fi
    if [ -n "$reason" ]; then line="${line} (${reason})"; fi
    echo "$line"
    i=$((i + 1))
  done
  echo "----"
  case "$EXIT_CODE" in
    0) echo "Result: OK (exit 0)" ;;
    2) echo "Result: FAIL — one or more MUSTs failed (exit 2)" ;;
    3) echo "Result: SHOULD-fail (exit 3)" ;;
    4) echo "Result: WARN — passes MUSTs with grandfathered warnings (exit 4)" ;;
  esac
}

# Minimal JSON string escaper.
json_escape() {
  printf '%s' "$1" | awk '
    BEGIN {
      for (j = 0; j < 32; j++) {
        ctrl[sprintf("%c", j)] = sprintf("\\u%04x", j)
      }
    }
    {
      s = $0
      gsub(/\\/, "\\\\", s)
      gsub(/"/,  "\\\"", s)
      gsub(/\t/, "\\t", s)
      gsub(/\r/, "\\r", s)
      printf "%s", s
    }
  '
}

emit_json() {
  printf '{\n'
  printf '  "target": "%s",\n'                "$(json_escape "$TARGET_ABS")"
  printf '  "ecl_version_targeted": "%s",\n'  "$(json_escape "$TARGET_VERSION")"
  printf '  "envelopes": %d,\n'               "$n_env"
  printf '  "level_filter": "%s",\n'          "$(json_escape "$LEVEL")"
  printf '  "results": [\n'
  i=0
  first=1
  while [ "$i" -lt "$n" ]; do
    level="${RES_LEVELS[$i]}"
    status="${RES_STATUSES[$i]}"
    name="${RES_NAMES[$i]}"
    id="${RES_IDS[$i]}"
    reason="${RES_REASONS[$i]}"
    target="${RES_TARGETS[$i]}"
    if [ "$first" -eq 0 ]; then printf ',\n'; fi
    first=0
    printf '    {"id": "%s", "level": "%s", "status": "%s", "name": "%s"' \
      "$(json_escape "$id")" "$(json_escape "$level")" "$(json_escape "$status")" "$(json_escape "$name")"
    if [ -n "$target" ]; then
      printf ', "target": "%s"' "$(json_escape "$target")"
    fi
    if [ -n "$reason" ]; then
      printf ', "reason": "%s"' "$(json_escape "$reason")"
    fi
    printf '}'
    i=$((i + 1))
  done
  printf '\n  ],\n'
  printf '  "exit_code": %d\n' "$EXIT_CODE"
  printf '}\n'
}

if [ "$OUTPUT" = "json" ]; then
  emit_json
else
  emit_human
fi

exit "$EXIT_CODE"
