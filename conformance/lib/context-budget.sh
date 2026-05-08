#!/usr/bin/env bash
# ECL conformance — context-delta budget checks (gate prefix D-).
# Sourced by check.sh. Bash 3.2 compatible.

ecl_check_context_budget() {
  local env_path="$1"
  local contracts_dir="$2"

  # If context_delta is not present, skip with a SHOULD-warn.
  if ! jq -e 'has("context_delta")' "$env_path" >/dev/null 2>&1; then
    ecl_record "D-0" "SHOULD" "warn" "context_delta_present" "envelope omits context_delta" "$env_path"
    return 0
  fi
  ecl_record "D-0" "SHOULD" "ok" "context_delta_present" "" "$env_path"

  local budget used
  budget="$(jq -r '.context_delta.token_budget // 0' "$env_path")"
  used="$(jq   -r '.context_delta.tokens_used  // 0' "$env_path")"

  # D-1: tokens_used <= token_budget (envelope-level).
  if [ "$used" -le "$budget" ]; then
    ecl_record "D-1" "MUST" "ok" "tokens_used_within_envelope_budget" "" "$env_path"
  else
    ecl_record "D-1" "MUST" "fail" "tokens_used_within_envelope_budget" "used=$used budget=$budget" "$env_path"
  fi

  # D-2: contract-level token_budget_max enforcement.
  local from to
  from="$(jq -r '.from.eidolon // ""' "$env_path")"
  to="$(jq   -r '.to.eidolon   // ""' "$env_path")"
  local contract
  contract="$(ecl_find_contract "$contracts_dir" "$from" "$to")"
  if [ -n "$contract" ]; then
    local cmax
    cmax="$(ecl_yaml_to_json "$contract" | jq -r '.context_delta.token_budget_max // empty')"
    if [ -n "$cmax" ] && [ "$cmax" != "null" ]; then
      if [ "$used" -le "$cmax" ]; then
        ecl_record "D-2" "MUST" "ok" "tokens_used_within_contract_budget" "" "$env_path"
      else
        ecl_record "D-2" "MUST" "fail" "tokens_used_within_contract_budget" "used=$used contract_max=$cmax" "$env_path"
      fi
    fi
  fi

  # D-3 (SHOULD): summary length under 200 tokens (heuristic chars/4).
  local summary_len heuristic_tokens
  summary_len="$(jq -r '.context_delta.summary // ""' "$env_path" | wc -c | tr -d '[:space:]')"
  heuristic_tokens=$(( summary_len / 4 ))
  if [ "$heuristic_tokens" -le 200 ]; then
    ecl_record "D-3" "SHOULD" "ok" "summary_within_200_tokens" "" "$env_path"
  else
    ecl_record "D-3" "SHOULD" "warn" "summary_within_200_tokens" "heuristic≈$heuristic_tokens" "$env_path"
  fi
}
