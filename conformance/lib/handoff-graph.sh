#!/usr/bin/env bash
# ECL conformance — handoff-graph checks (gate prefix C-).
# Sourced by check.sh. Bash 3.2 compatible.
#
# Validates that the envelope's (from, to) edge has a contract,
# that the envelope's performative is allowed, and that the artifact
# kind matches a contract artifact entry.

# yq invocation that works with both mikefarah-go and python-yq variants.
ecl_yaml_to_json() {
  local file="$1"
  if command -v yq >/dev/null 2>&1; then
    # Try mikefarah Go yq first (-o=json), then python yq (auto-JSON on
    # stdout), then fall back to a direct python invocation if available.
    if yq eval '.' "$file" -o=json >/dev/null 2>&1; then
      yq eval '.' "$file" -o=json
      return 0
    fi
    if yq -o=json '.' "$file" >/dev/null 2>&1; then
      yq -o=json '.' "$file"
      return 0
    fi
    # python-yq treats yq as a shim for jq + yaml; this is the bare
    # filter form.
    if yq '.' "$file" >/dev/null 2>&1; then
      yq '.' "$file"
      return 0
    fi
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import sys, json
try:
  import yaml
except Exception:
  sys.exit(2)
with open(sys.argv[1]) as f:
  print(json.dumps(yaml.safe_load(f)))
' "$file" 2>/dev/null
    return $?
  fi
  return 1
}

ecl_find_contract() {
  # Args: $1 contracts_dir, $2 from, $3 to
  # Echo: contract path or empty.
  local contracts_dir="$1"
  local from="$2"
  local to="$3"
  local f
  for f in "$contracts_dir"/*.yaml; do
    [ -f "$f" ] || continue
    local cf ct
    cf="$(ecl_yaml_to_json "$f" | jq -r '.from // ""')"
    ct="$(ecl_yaml_to_json "$f" | jq -r '.to // ""')"
    if [ "$cf" = "$from" ] && [ "$ct" = "$to" ]; then
      echo "$f"
      return 0
    fi
  done
  return 1
}

ecl_check_handoff_graph() {
  local env_path="$1"
  local contracts_dir="$2"

  local from to perf kind
  from="$(jq -r '.from.eidolon  // ""' "$env_path")"
  to="$(jq   -r '.to.eidolon    // ""' "$env_path")"
  perf="$(jq -r '.performative  // ""' "$env_path")"
  kind="$(jq -r '.artifact.kind // ""' "$env_path")"

  # C-1: contract exists for this edge.
  local contract
  contract="$(ecl_find_contract "$contracts_dir" "$from" "$to")"
  if [ -z "$contract" ]; then
    ecl_record "C-1" "MUST" "fail" "contract_for_edge_exists" "no contract for ${from} -> ${to}" "$env_path"
    return 0
  fi
  ecl_record "C-1" "MUST" "ok" "contract_for_edge_exists" "" "$env_path"

  local contract_json
  contract_json="$(ecl_yaml_to_json "$contract")"

  # C-2: performative ∈ contract.performatives_allowed.
  if printf '%s' "$contract_json" \
     | jq -e --arg perf "$perf" '.performatives_allowed | index($perf) != null' \
     >/dev/null 2>&1; then
    ecl_record "C-2" "MUST" "ok" "performative_allowed_on_edge" "" "$env_path"
  else
    ecl_record "C-2" "MUST" "fail" "performative_allowed_on_edge" "performative=$perf not in contract" "$env_path"
  fi

  # C-3: artifact.kind matches some contract.artifacts[*].kind.
  if printf '%s' "$contract_json" \
     | jq -e --arg kind "$kind" '[.artifacts[].kind] | index($kind) != null' \
     >/dev/null 2>&1; then
    ecl_record "C-3" "MUST" "ok" "artifact_kind_allowed_on_edge" "" "$env_path"
  else
    ecl_record "C-3" "MUST" "fail" "artifact_kind_allowed_on_edge" "kind=$kind not in contract" "$env_path"
  fi

  # C-4: edge_origin in envelope matches contract.edge_origin (when set).
  local env_eo contract_eo
  env_eo="$(jq -r '.edge_origin // ""' "$env_path")"
  contract_eo="$(printf '%s' "$contract_json" | jq -r '.edge_origin // ""')"
  if [ -n "$env_eo" ] && [ "$env_eo" != "$contract_eo" ]; then
    ecl_record "C-4" "SHOULD" "warn" "edge_origin_consistent" "envelope=$env_eo contract=$contract_eo" "$env_path"
  else
    ecl_record "C-4" "SHOULD" "ok" "edge_origin_consistent" "" "$env_path"
  fi
}
