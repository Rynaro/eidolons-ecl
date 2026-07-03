#!/usr/bin/env bash
# ECL conformance — ISE trust-hierarchy checks (gate prefix S-).
# Sourced by check.sh. Bash 3.2 compatible.
# Implements gates S-1 (ISE_BLOCK_SHAPE), S-2 (ISE_AUTHZ_HONORED),
# S-3 (ISE_REQUIRED_AT_HIGH), S-4 (ISE_VERIFICATION_SHAPE) per spec §6.5.
#
# Version-aware behaviour (per-envelope, keyed on .envelope_version):
#   - S-3 is SHOULD/WARN at ≤v2.0 and MUST/FAIL at v2.1 (spec §6.5.5).
#   - S-4 is a v2.1 gate: it runs (MUST) only for 2.1 envelopes that carry
#     the OPTIONAL ise.verification sub-block; ≤v2.0 output is unchanged.

ecl_check_ise() {
  local env_path="$1"

  # Check if ISE block is present.
  local ise_present
  ise_present="$(jq -e '.ise' "$env_path" >/dev/null 2>&1 && echo "true" || echo "false")"

  # S-1 (MUST): If ise present, validate block shape.
  if [ "$ise_present" = "true" ]; then
    check_s1_ise_block_shape "$env_path"
    check_s2_ise_authz_honored "$env_path"
    # S-4 (MUST, v2.1): if the optional ise.verification sub-block is present
    # on a 2.1 envelope, its shape is checked. No-op for ≤v2.0 envelopes.
    check_s4_ise_verification_shape "$env_path"
  fi

  # S-3 (SHOULD/WARN at ≤v2.0; MUST/FAIL at v2.1): trust_level=high AND ise absent.
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

# S-3: ISE_REQUIRED_AT_HIGH — trust_level=high AND ise absent.
# Version-aware level (per-envelope, keyed on .envelope_version):
#   - ≤v2.0 → SHOULD/WARN (non-blocking; behaviour byte-identical to v2.0).
#   - v2.1  → MUST/FAIL (spec §6.5.5 promotion, realised at v2.1).
# v1.x envelopes pre-date ISE; S-3 does not apply to them (§7.3 back-compat).
# The gate name is stable across levels ("ise_required_at_high").
check_s3_ise_required_at_high() {
  local env_path="$1"
  local trust ise_present env_version level
  env_version="$(jq -r '.envelope_version // "0.0"' "$env_path")"
  case "$env_version" in
    1.0|1.0.*|1.1|1.1.*|1.2|1.2.*)
      # v1.x envelopes pre-date ISE; S-3 does not apply (§7.3 back-compat).
      ecl_record "S-3" "SHOULD" "ok" "ise_required_at_high" "" "$env_path"
      return 0
      ;;
    2.1|2.1.*)
      # v2.1: S-3 promoted SHOULD → MUST (spec §6.5.5).
      level="MUST"
      ;;
    *)
      # v2.0 (and any other 2.x default): SHOULD-level warn (promotion candidate).
      level="SHOULD"
      ;;
  esac
  trust="$(jq -r '.constraints.trust_level // "standard"' "$env_path")"
  ise_present="$(jq -e '.ise' "$env_path" >/dev/null 2>&1 && echo "true" || echo "false")"

  if [ "$trust" = "high" ] && [ "$ise_present" = "false" ]; then
    if [ "$level" = "MUST" ]; then
      ecl_record "S-3" "MUST" "fail" "ise_required_at_high" \
        "trust_level=high requires an ise.* block at ECL v2.1 (spec §6.5.5); ise absent" \
        "$env_path"
    else
      ecl_record "S-3" "SHOULD" "warn" "ise_required_at_high" \
        "trust_level=high without ise.* block; see spec §6.5.5. [PROMOTION-CANDIDATE: MUST at v2.1]" \
        "$env_path"
    fi
  else
    ecl_record "S-3" "$level" "ok" "ise_required_at_high" "" "$env_path"
  fi
  return 0
}

# S-4 (MUST, v2.1): ISE_VERIFICATION_SHAPE — when a 2.1 envelope carries the
# OPTIONAL ise.verification sub-block, validate its shape (spec §6.5.8):
#   - fresh_context   MUST be a boolean.
#   - checker         MUST match the from/to eidolon-slug pattern ^[a-z][a-z0-9-]*$.
#   - transcript_access MUST be one of {none, artifact-only}; unknown values rejected.
# S-4 is scoped to v2.1: it emits nothing for ≤v2.0 envelopes (those never
# carried ise.verification), so ≤v2.0 output stays byte-identical. When the
# sub-block is absent, S-4 is not-applicable and records nothing.
check_s4_ise_verification_shape() {
  local env_path="$1"
  local env_version
  env_version="$(jq -r '.envelope_version // "0.0"' "$env_path")"
  case "$env_version" in
    2.1|2.1.*) : ;;
    *) return 0 ;;
  esac

  local ver_present
  ver_present="$(jq -e '.ise.verification' "$env_path" >/dev/null 2>&1 && echo "true" || echo "false")"
  if [ "$ver_present" = "false" ]; then
    return 0
  fi

  local fresh_type checker taccess problems
  fresh_type="$(jq -r '.ise.verification.fresh_context | type' "$env_path" 2>/dev/null)"
  checker="$(jq -r '.ise.verification.checker // ""' "$env_path")"
  taccess="$(jq -r '.ise.verification.transcript_access // ""' "$env_path")"
  problems=""

  case "$fresh_type" in
    boolean) : ;;
    null|"") problems="${problems}fresh_context missing; " ;;
    *)       problems="${problems}fresh_context must be boolean (got type $fresh_type); " ;;
  esac

  if [ -z "$checker" ]; then
    problems="${problems}checker missing; "
  elif ! printf '%s' "$checker" | grep -Eq '^[a-z][a-z0-9-]*$'; then
    problems="${problems}checker invalid slug (got '$checker'); "
  fi

  case "$taccess" in
    none|artifact-only) : ;;
    "") problems="${problems}transcript_access missing; " ;;
    *)  problems="${problems}transcript_access invalid (got '$taccess'; must be none|artifact-only); " ;;
  esac

  if [ -n "$problems" ]; then
    ecl_record "S-4" "MUST" "fail" "ise_verification_shape" "${problems% }" "$env_path"
  else
    ecl_record "S-4" "MUST" "ok" "ise_verification_shape" "" "$env_path"
  fi
  return 0
}
