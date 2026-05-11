#!/usr/bin/env bash
# Worked example: APIVR-Δ → VIGIL → APIVR-Δ escalation.
#
# APIVR-Δ hits the 3-failure threshold on a flaky test, escalates to
# VIGIL, VIGIL emits a root-cause report and verified patch, APIVR-Δ
# (would) resume. The example covers the two on-disk envelopes
# (apivr→vigil and vigil→apivr) plus an ACKNOWLEDGE envelope from
# APIVR-Δ to close the loop.

set -eu

EX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ECL_ROOT="$(cd "$EX_DIR/../.." && pwd)"
SDK="$ECL_ROOT/reference-sdk/bash"
TRACE_DIR="$EX_DIR/.eidolons/.trace"

rm -rf "$EX_DIR/.eidolons" "$EX_DIR"/*.envelope.json
mkdir -p "$TRACE_DIR"

THREAD_ID="$(uuidgen | tr 'A-Z' 'a-z')"

# ECL v1.1 §6.4 — apivr↔vigil escalation declares trust_level=high in its
# contracts. Per §6.2.6 and gate I-5, high-trust envelopes SHOULD use
# hmac-sha256. Provision a per-thread demo key for the worked example.
# Real deployments source this from a secrets manager (§6.4.1).
export ECL_HMAC_KEY="ecl-worked-example-apivr-vigil-${THREAD_ID}"

# 1. APIVR-Δ → VIGIL (ESCALATE).
APIVR_MID="$(uuidgen | tr 'A-Z' 'a-z')"
bash "$SDK/handoff-emit.sh" \
  --artifact "$EX_DIR/repair-failed-report.md" \
  --contract "$ECL_ROOT/contracts/apivr-to-vigil.yaml" \
  --performative ESCALATE \
  --objective "Flaky roster-fetch test; 3-failure threshold reached." \
  --from-version 3.0.5 \
  --to-version 1.0.3 \
  --message-id "$APIVR_MID" \
  --thread-id "$THREAD_ID" \
  --tokens-used 410 \
  --summary "Three Reflect attempts on flaky-network-test category; same flake persists under retry budget +2, jittered backoff, and fetch-timeout pin. Sandbox authority granted." \
  --confidence 0.7 \
  --integrity-method hmac-sha256 \
  --trace-dir "$TRACE_DIR"

# 2. VIGIL → APIVR-Δ (PROPOSE root-cause + verified patch).
VIGIL_MID="$(uuidgen | tr 'A-Z' 'a-z')"
bash "$SDK/handoff-emit.sh" \
  --artifact "$EX_DIR/root-cause-report.md" \
  --contract "$ECL_ROOT/contracts/vigil-to-apivr.yaml" \
  --performative PROPOSE \
  --objective "Root-cause attribution and verified patch returned to APIVR-Δ." \
  --from-version 1.0.3 \
  --to-version 3.0.5 \
  --message-id "$VIGIL_MID" \
  --thread-id "$THREAD_ID" \
  --parent-id "$APIVR_MID" \
  --tokens-used 520 \
  --summary "Confirmed cause: cli/src/sync.sh:88 || mask of git-fetch exit code during retry. Counterfactual flip in 12/12 sandbox runs. Patch in .vigil-sandbox/." \
  --confidence 0.93 \
  --integrity-method hmac-sha256 \
  --trace-dir "$TRACE_DIR"

# 3. APIVR-Δ → VIGIL (ACKNOWLEDGE the root-cause + closeout).
# Use a tiny acknowledgement payload.
ACK_PATH="$EX_DIR/ack.md"
cat > "$ACK_PATH" <<'EOF'
---
eidolon: apivr
version: 3.0.5
kind: repair-failed-report
status: closed
created_at: "2026-05-07T17:00:00Z"
failure_category: flaky-network-test
attempts: 3
last_test_command: "bats cli/tests/sync.bats -f 'roster fetch retry'"
trace_artifact_paths: []
---

# Closeout
Patch applied. Test passes 12/12 in CI. Threading closed.
EOF
ACK_MID="$(uuidgen | tr 'A-Z' 'a-z')"
bash "$SDK/handoff-emit.sh" \
  --artifact "$ACK_PATH" \
  --contract "$ECL_ROOT/contracts/apivr-to-vigil.yaml" \
  --performative ACKNOWLEDGE \
  --objective "Patch applied and verified; closing escalation thread." \
  --from-version 3.0.5 \
  --to-version 1.0.3 \
  --message-id "$ACK_MID" \
  --thread-id "$THREAD_ID" \
  --parent-id "$VIGIL_MID" \
  --tokens-used 30 \
  --summary "Patch landed; flake gone." \
  --confidence 0.95 \
  --integrity-method hmac-sha256 \
  --trace-dir "$TRACE_DIR"

echo
echo "==== conformance check on $EX_DIR ===="
bash "$ECL_ROOT/conformance/check.sh" "$EX_DIR" --level=MUST
rc=$?

echo
echo "==== trace events ===="
cat "$TRACE_DIR/$THREAD_ID.jsonl" | jq -c '{ts,event,from,to,performative}'

exit "$rc"
