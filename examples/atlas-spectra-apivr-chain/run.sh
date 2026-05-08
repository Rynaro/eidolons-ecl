#!/usr/bin/env bash
# Worked example: ATLAS → SPECTRA → APIVR-Δ chain.
#
# Emits envelopes alongside three pre-staged artefacts (scout-report.md,
# spec.md, apivr-completion-report.md), appends trace events to a shared
# thread, and validates the resulting directory with the conformance
# checker.

set -eu

EX_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ECL_ROOT="$(cd "$EX_DIR/../.." && pwd)"
SDK="$ECL_ROOT/reference-sdk/bash"
TRACE_DIR="$EX_DIR/.eidolons/.trace"

# Clean previous run.
rm -rf "$EX_DIR/.eidolons" "$EX_DIR"/*.envelope.json
mkdir -p "$TRACE_DIR"

# One thread for the whole chain.
THREAD_ID="$(uuidgen | tr 'A-Z' 'a-z')"

# 1. ATLAS → SPECTRA.
ATLAS_MID="$(uuidgen | tr 'A-Z' 'a-z')"
bash "$SDK/handoff-emit.sh" \
  --artifact "$EX_DIR/scout-report.md" \
  --contract "$ECL_ROOT/contracts/atlas-to-spectra.yaml" \
  --performative PROPOSE \
  --objective "Hand off scout-report for install.sh dead-code cleanup spec authoring." \
  --from-version 1.4.2 \
  --to-version 4.2.11 \
  --message-id "$ATLAS_MID" \
  --thread-id "$THREAD_ID" \
  --tokens-used 380 \
  --summary "Four findings on install.sh dead code; one gap (Cursor wiring trace) deferred. Scope bounded to install.sh." \
  --confidence 0.92 \
  --trace-dir "$TRACE_DIR"

# 2. SPECTRA → APIVR-Δ.
SPECTRA_MID="$(uuidgen | tr 'A-Z' 'a-z')"
bash "$SDK/handoff-emit.sh" \
  --artifact "$EX_DIR/spec.md" \
  --contract "$ECL_ROOT/contracts/spectra-to-apivr.yaml" \
  --performative PROPOSE \
  --objective "Hand off cleanup spec; two stories, three validation gates." \
  --from-version 4.2.11 \
  --to-version 3.0.5 \
  --message-id "$SPECTRA_MID" \
  --thread-id "$THREAD_ID" \
  --parent-id "$ATLAS_MID" \
  --tokens-used 540 \
  --summary "Two stories: remove _legacy_wire_mcp and _warn_v0_target. Gates: bats + shellcheck + dry-run byte equivalence." \
  --confidence 0.92 \
  --trace-dir "$TRACE_DIR"

# 3. APIVR-Δ → IDG.
APIVR_MID="$(uuidgen | tr 'A-Z' 'a-z')"
bash "$SDK/handoff-emit.sh" \
  --artifact "$EX_DIR/apivr-completion-report.md" \
  --contract "$ECL_ROOT/contracts/apivr-to-idg.yaml" \
  --performative PROPOSE \
  --objective "Hand off completion report for chronicling." \
  --from-version 3.0.5 \
  --to-version 1.1.5 \
  --message-id "$APIVR_MID" \
  --thread-id "$THREAD_ID" \
  --parent-id "$SPECTRA_MID" \
  --tokens-used 280 \
  --summary "Both stories implemented. -36 lines net. 14/14 bats pass. One Reflect trip fixed via editorconfig." \
  --confidence 0.95 \
  --trace-dir "$TRACE_DIR"

echo
echo "==== conformance check on $EX_DIR ===="
bash "$ECL_ROOT/conformance/check.sh" "$EX_DIR" --level=MUST
rc=$?

echo
echo "==== trace events ===="
cat "$TRACE_DIR/$THREAD_ID.jsonl" | jq -c '{ts,event,from,to,performative}'

exit "$rc"
