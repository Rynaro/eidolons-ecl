#!/usr/bin/env bash
# ECL conformance — envelope structural checks (gate prefix E-).
# Sourced by check.sh. Bash 3.2 compatible.

# Required top-level fields per spec §1.1.
ECL_REQUIRED_FIELDS="envelope_version message_id thread_id parent_id from to performative objective artifact integrity trace"

ecl_check_envelope() {
  # Args: $1 envelope-path
  local env_path="$1"
  local target
  target="$(basename "$env_path")"

  # E-1: file is valid JSON.
  if ! jq empty "$env_path" 2>/dev/null; then
    ecl_record "E-1" "MUST" "fail" "envelope_is_json" "jq parse failed" "$env_path"
    return 0
  fi
  ecl_record "E-1" "MUST" "ok" "envelope_is_json" "" "$env_path"

  # E-2: required fields present.
  local missing=""
  local field
  for field in $ECL_REQUIRED_FIELDS; do
    if ! jq -e "has(\"$field\")" "$env_path" >/dev/null 2>&1; then
      missing="${missing}${field} "
    fi
  done
  if [ -n "$missing" ]; then
    ecl_record "E-2" "MUST" "fail" "required_fields_present" "missing: ${missing% }" "$env_path"
  else
    ecl_record "E-2" "MUST" "ok" "required_fields_present" "" "$env_path"
  fi

  # E-3: envelope_version matches ^1\.0(\.\d+)?$.
  local v
  v="$(jq -r '.envelope_version // ""' "$env_path")"
  case "$v" in
    1.0|1.0.*) ecl_record "E-3" "MUST" "ok" "envelope_version_supported" "" "$env_path" ;;
    *)         ecl_record "E-3" "MUST" "fail" "envelope_version_supported" "got: $v" "$env_path" ;;
  esac

  # E-4: performative is one of the ten enumerated values.
  local perf
  perf="$(jq -r '.performative // ""' "$env_path")"
  case "$perf" in
    REQUEST|INFORM|PROPOSE|CRITIQUE|DECIDE|DELEGATE|ACKNOWLEDGE|ESCALATE|RESUME|REFUSE)
      ecl_record "E-4" "MUST" "ok" "performative_in_enum" "" "$env_path"
      ;;
    *)
      ecl_record "E-4" "MUST" "fail" "performative_in_enum" "got: $perf" "$env_path"
      ;;
  esac

  # E-5: from.eidolon and to.eidolon match slug pattern.
  local fe te
  fe="$(jq -r '.from.eidolon // ""' "$env_path")"
  te="$(jq -r '.to.eidolon // ""' "$env_path")"
  if printf '%s' "$fe" | grep -Eq '^[a-z][a-z0-9-]*$|^human$|^orchestrator$' && \
     printf '%s' "$te" | grep -Eq '^[a-z][a-z0-9-]*$|^human$|^orchestrator$'; then
    ecl_record "E-5" "MUST" "ok" "agent_refs_well_formed" "" "$env_path"
  else
    ecl_record "E-5" "MUST" "fail" "agent_refs_well_formed" "from=$fe to=$te" "$env_path"
  fi

  # E-6: artifact.path does not begin with / or contain ..
  local apath
  apath="$(jq -r '.artifact.path // ""' "$env_path")"
  case "$apath" in
    /*)        ecl_record "E-6" "MUST" "fail" "artifact_path_relative" "absolute path: $apath" "$env_path" ;;
    *..*)      ecl_record "E-6" "MUST" "fail" "artifact_path_relative" "contains '..': $apath" "$env_path" ;;
    "")        ecl_record "E-6" "MUST" "fail" "artifact_path_relative" "missing artifact.path" "$env_path" ;;
    *)         ecl_record "E-6" "MUST" "ok" "artifact_path_relative" "" "$env_path" ;;
  esac

  # E-7 (SHOULD): edge_origin populated.
  local eo
  eo="$(jq -r '.edge_origin // ""' "$env_path")"
  if [ -n "$eo" ]; then
    ecl_record "E-7" "SHOULD" "ok" "edge_origin_populated" "" "$env_path"
  else
    ecl_record "E-7" "SHOULD" "warn" "edge_origin_populated" "missing edge_origin" "$env_path"
  fi

  # E-8 (MUST): trace.tier is standard or trance.
  local tier
  tier="$(jq -r '.trace.tier // ""' "$env_path")"
  case "$tier" in
    standard|trance) ecl_record "E-8" "MUST" "ok" "trace_tier_valid" "" "$env_path" ;;
    *)               ecl_record "E-8" "MUST" "fail" "trace_tier_valid" "got: $tier" "$env_path" ;;
  esac
}
