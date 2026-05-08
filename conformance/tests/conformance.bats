#!/usr/bin/env bats
# Bats tests for ECL conformance/check.sh.
#
# Run:
#   bats conformance/tests/conformance.bats
#
# Each test launches check.sh against a fixture under fixtures/ and asserts
# the expected exit code and a key gate outcome.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  CHECK="$REPO_ROOT/conformance/check.sh"
  FIXTURES="$REPO_ROOT/conformance/tests/fixtures"
}

@test "conformant-handoff: exits 0 (all gates pass)" {
  run bash "$CHECK" "$FIXTURES/conformant-handoff"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Result: OK (exit 0)"* ]]
}

@test "conformant-handoff: I-3 integrity_match passes" {
  run bash "$CHECK" "$FIXTURES/conformant-handoff"
  [[ "$output" == *"[OK]   I-3 MUST integrity_match"* ]]
}

@test "conformant-handoff: C-1 contract_for_edge_exists passes" {
  run bash "$CHECK" "$FIXTURES/conformant-handoff"
  [[ "$output" == *"[OK]   C-1 MUST contract_for_edge_exists"* ]]
}

@test "conformant-handoff: D-1 tokens_used_within_envelope_budget passes" {
  run bash "$CHECK" "$FIXTURES/conformant-handoff"
  [[ "$output" == *"[OK]   D-1 MUST tokens_used_within_envelope_budget"* ]]
}

@test "missing-integrity: exits 2" {
  run bash "$CHECK" "$FIXTURES/missing-integrity"
  [ "$status" -eq 2 ]
}

@test "missing-integrity: I-3 integrity_match fails" {
  run bash "$CHECK" "$FIXTURES/missing-integrity"
  [[ "$output" == *"[FAIL] I-3 MUST integrity_match"* ]]
}

@test "undeclared-edge: exits 2" {
  run bash "$CHECK" "$FIXTURES/undeclared-edge"
  [ "$status" -eq 2 ]
}

@test "undeclared-edge: C-1 contract_for_edge_exists fails" {
  run bash "$CHECK" "$FIXTURES/undeclared-edge"
  [[ "$output" == *"[FAIL] C-1 MUST contract_for_edge_exists"* ]]
}

@test "over-budget-context: exits 2" {
  run bash "$CHECK" "$FIXTURES/over-budget-context"
  [ "$status" -eq 2 ]
}

@test "over-budget-context: D-1 envelope-budget gate fails" {
  run bash "$CHECK" "$FIXTURES/over-budget-context"
  [[ "$output" == *"[FAIL] D-1 MUST tokens_used_within_envelope_budget"* ]]
}

@test "over-budget-context: D-2 contract-budget gate fails" {
  run bash "$CHECK" "$FIXTURES/over-budget-context"
  [[ "$output" == *"[FAIL] D-2 MUST tokens_used_within_contract_budget"* ]]
}

@test "JSON output mode emits valid JSON" {
  run bash "$CHECK" "$FIXTURES/conformant-handoff" --json
  [ "$status" -eq 0 ]
  echo "$output" | jq empty
}

@test "JSON output reports exit_code field correctly" {
  run bash "$CHECK" "$FIXTURES/missing-integrity" --json
  [ "$status" -eq 2 ]
  ec=$(echo "$output" | jq -r '.exit_code')
  [ "$ec" = "2" ]
}

@test "--help prints usage and exits 0" {
  run bash "$CHECK" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
  [[ "$output" == *"--contracts DIR"* ]]
}

@test "--version prints semver and exits 0" {
  run bash "$CHECK" --version
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

@test "missing target path returns 1" {
  run bash "$CHECK"
  [ "$status" -eq 1 ]
}

@test "non-existent target path returns 1" {
  run bash "$CHECK" /this/path/does/not/exist
  [ "$status" -eq 1 ]
}
