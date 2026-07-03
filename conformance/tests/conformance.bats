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

@test "conformant-ise-v2: exits 0 (all gates pass)" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Result: OK (exit 0)"* ]]
}

@test "conformant-ise-v2: S-1 ise_block_shape passes" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2"
  [[ "$output" == *"[OK]   S-1 MUST ise_block_shape"* ]]
}

@test "conformant-ise-v2: I-3 integrity_match passes" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2"
  [[ "$output" == *"[OK]   I-3 MUST integrity_match"* ]]
}

@test "ise-missing-hierarchy: exits 2 (S-1 fails)" {
  run bash "$CHECK" "$FIXTURES/ise-missing-hierarchy"
  [ "$status" -eq 2 ]
}

@test "ise-missing-hierarchy: S-1 ise_block_shape fails" {
  run bash "$CHECK" "$FIXTURES/ise-missing-hierarchy"
  [[ "$output" == *"[FAIL] S-1 MUST ise_block_shape"* ]]
}

@test "v1-on-v2-compat: exits 0 (E-3.compat INFO emitted)" {
  run bash "$CHECK" "$FIXTURES/v1-on-v2-compat"
  [ "$status" -eq 0 ]
}

@test "v1-on-v2-compat: E-3.compat INFO emitted for v1.x envelope" {
  run bash "$CHECK" "$FIXTURES/v1-on-v2-compat"
  [[ "$output" == *"E-3.compat INFO v1x_accepted_under_v2_receiver"* ]]
}

# --- ECL v2.1 (Draft) gates: I-5/S-3 promoted to MUST, new S-4 ---------------

@test "conformant-ise-v2.1: exits 0 (all v2.1 gates pass)" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2.1"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Result: OK (exit 0)"* ]]
}

@test "conformant-ise-v2.1: S-4 ise_verification_shape passes (MUST)" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2.1"
  [[ "$output" == *"[OK]   S-4 MUST ise_verification_shape"* ]]
}

@test "conformant-ise-v2.1: S-3 is MUST-level and passes at v2.1" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2.1"
  [[ "$output" == *"[OK]   S-3 MUST ise_required_at_high"* ]]
}

@test "conformant-ise-v2.1: I-5 is MUST-level and passes at v2.1" {
  run bash "$CHECK" "$FIXTURES/conformant-ise-v2.1"
  [[ "$output" == *"[OK]   I-5 MUST hmac_recommended_at_high_trust"* ]]
}

@test "ise-verification-invalid-v2.1: exits 2 (S-4 fails)" {
  run bash "$CHECK" "$FIXTURES/ise-verification-invalid-v2.1"
  [ "$status" -eq 2 ]
}

@test "ise-verification-invalid-v2.1: S-4 ise_verification_shape fails on unknown transcript_access" {
  run bash "$CHECK" "$FIXTURES/ise-verification-invalid-v2.1"
  [[ "$output" == *"[FAIL] S-4 MUST ise_verification_shape"* ]]
  [[ "$output" == *"transcript_access invalid"* ]]
}

@test "high-trust-no-ise-v2.1: exits 2 (S-3 and I-5 promoted to MUST)" {
  run bash "$CHECK" "$FIXTURES/high-trust-no-ise-v2.1"
  [ "$status" -eq 2 ]
}

@test "high-trust-no-ise-v2.1: S-3 fails at MUST level (v2.1 promotion)" {
  run bash "$CHECK" "$FIXTURES/high-trust-no-ise-v2.1"
  [[ "$output" == *"[FAIL] S-3 MUST ise_required_at_high"* ]]
}

@test "high-trust-no-ise-v2.1: I-5 fails at MUST level (v2.1 promotion)" {
  run bash "$CHECK" "$FIXTURES/high-trust-no-ise-v2.1"
  [[ "$output" == *"[FAIL] I-5 MUST hmac_recommended_at_high_trust"* ]]
}

@test "high-trust-sha256-v2 (regression): 2.0 envelope still only WARNS (exit 4)" {
  run bash "$CHECK" "$FIXTURES/high-trust-sha256-v2"
  [ "$status" -eq 4 ]
  [[ "$output" == *"Result: WARN"* ]]
}

@test "high-trust-sha256-v2 (regression): I-5 stays SHOULD/WARN at v2.0" {
  run bash "$CHECK" "$FIXTURES/high-trust-sha256-v2"
  [[ "$output" == *"[WARN] I-5 SHOULD hmac_recommended_at_high_trust"* ]]
}

@test "high-trust-sha256-v2 (regression): S-3 stays SHOULD/WARN at v2.0" {
  run bash "$CHECK" "$FIXTURES/high-trust-sha256-v2"
  [[ "$output" == *"[WARN] S-3 SHOULD ise_required_at_high"* ]]
}

@test "conformant-high-trust-v2.1: high-trust hmac hand-off passes (exit 0)" {
  command -v openssl >/dev/null 2>&1 || skip "openssl required for HMAC verification"
  export ECL_HMAC_KEY="ecl-test-key-2.1"
  run bash "$CHECK" "$FIXTURES/conformant-high-trust-v2.1"
  [ "$status" -eq 0 ]
  [[ "$output" == *"[OK]   I-5 MUST hmac_recommended_at_high_trust"* ]]
  [[ "$output" == *"[OK]   S-3 MUST ise_required_at_high"* ]]
  [[ "$output" == *"[OK]   S-4 MUST ise_verification_shape"* ]]
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
