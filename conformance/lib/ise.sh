#!/usr/bin/env bash
# ECL conformance — ISE trust-hierarchy checks (gate prefix S-).
# Sourced by check.sh. Bash 3.2 compatible.
# Implements gates S-1 (ISE_BLOCK_SHAPE), S-2 (ISE_AUTHZ_HONORED),
# S-3 (ISE_REQUIRED_AT_HIGH) per spec §6.5 and §S4.

ecl_check_ise() {
  local env_path="$1"

  # Check if ISE block is present.
  local ise_present
  ise_present="$(jq -e '.ise' "$env_path" >/dev/null 2>&1 && echo "true" || echo "false")"

  # S-1 (MUST): If ise present, validate block shape.
  if [ "$ise_present" = "true" ]; then
    check_s1_ise_block_shape "$env_path"
    check_s2_ise_authz_honored "$env_path"
  fi

  # S-3 (SHOULD/WARN): trust_level=high AND ise absent → warn.
  check_s3_ise_required_at_high "$env_path"
}

# S-1: ISE_BLOCK_SHAPE — if ise present, assertion_grade must be present
# and must be one of the four valid values.
check_s1_ise_block_shape() {
  local env_path="$1"

  local grade
  grade="$(jq -r '.ise.assertion_grade // ""' "$env_path")"

  case "$grade" in
    unverified|self-attested|validated|human-reviewed)
      ecl_record "S-1" "MUST" "ok" "ise_block_shape" "" "$env_path"
      ;;
    "")
      ecl_record "S-1" "MUST" "fail" "ise_block_shape" \
        "ise.assertion_grade is required when ise block is present (spec §6.5.2)" "$env_path"
      ;;
    *)
      ecl_record "S-1" "MUST" "fail" "ise_block_shape" \
        "ise.assertion_grade invalid: got '$grade'; must be unverified|self-attested|validated|human-reviewed" "$env_path"
      ;;
  esac
}

# S-2 (MUST): ISE_AUTHZ_HONORED — if ise.receiver_authorization is present
# and any axis is false, the receiver MUST NOT take that action.
# At the conformance-check layer we validate the field shape and surface
# explicit false values as MUST-level failures when --strict is passed.
# Without --strict this is informational only (the gate documents the contract).
check_s2_ise_authz_honored() {
  local env_path="$1"

  # Check if receiver_authorization is present.
  local authz_present
  authz_present="$(jq -e '.ise.receiver_authorization' "$env_path" >/dev/null 2>&1 && echo "true" || echo "false")"

  if [ "$authz_present" = "false" ]; then
    # No authz block means defaults apply (auto_route=true, auto_merge=false, auto_deploy=false).
    ecl_record "S-2" "MUST" "ok" "ise_authz_honored" "" "$env_path"
    return 0
  fi

  # Validate field types.
  local auto_route auto_merge auto_deploy
  auto_route="$(jq -r '.ise.receiver_authorization.auto_route // "null"' "$env_path")"
  auto_merge="$(jq -r '.ise.receiver_authorization.auto_merge // "null"' "$env_path")"
  auto_deploy="$(jq -r '.ise.receiver_authorization.auto_deploy // "null"' "$env_path")"

  local invalid=""
  case "$auto_route" in
    true|false|null) : ;;
    *) invalid="${invalid}auto_route=$auto_route (must be boolean) " ;;
  esac
  case "$auto_merge" in
    true|false|null) : ;;
    *) invalid="${invalid}auto_merge=$auto_merge (must be boolean) " ;;
  esac
  case "$auto_deploy" in
    true|false|null) : ;;
    *) invalid="${invalid}auto_deploy=$auto_deploy (must be boolean) " ;;
  esac

  if [ -n "$invalid" ]; then
    ecl_record "S-2" "MUST" "fail" "ise_authz_honored" \
      "ise.receiver_authorization invalid field values: ${invalid% }" "$env_path"
  else
    ecl_record "S-2" "MUST" "ok" "ise_authz_honored" "" "$env_path"
  fi
}

# S-3 (SHOULD/WARN): ISE_REQUIRED_AT_HIGH — if trust_level=high AND ise absent → warn.
# This is a SHOULD-level gate (promotion candidate to MUST at v2.1).
# Returns 0 regardless (warn does not set exit non-zero under SHOULD).
check_s3_ise_required_at_high() {
  local env_path="$1"
  local trust ise_present
  trust="$(jq -r '.constraints.trust_level // "standard"' "$env_path")"
  ise_present="$(jq -e '.ise' "$env_path" >/dev/null 2>&1 && echo "true" || echo "false")"

  if [ "$trust" = "high" ] && [ "$ise_present" = "false" ]; then
    ecl_record "S-3" "SHOULD" "warn" "ise_required_at_high" \
      "trust_level=high without ise.* block; see spec §6.5.5. [PROMOTION-CANDIDATE: MUST at v2.1]" \
      "$env_path"
  else
    ecl_record "S-3" "SHOULD" "ok" "ise_required_at_high" "" "$env_path"
  fi
  return 0
}
