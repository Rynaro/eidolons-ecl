#!/usr/bin/env bash
# ECL conformance — integrity checks (gate prefix I-).
# Sourced by check.sh. Bash 3.2 compatible.

# Recompute SHA-256 over the payload bytes; verify against integrity.value
# (when method=sha256). HMAC-SHA-256 verification is attempted only when
# ECL_HMAC_KEY is set in the environment; otherwise a warn is emitted per
# §6.2.3.

ecl_compute_sha256() {
  # Args: $1 file
  # Echos: lowercase hex digest, no trailing newline.
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "shasum/sha256sum unavailable" >&2
    return 1
  fi
}

ecl_compute_hmac_sha256() {
  # Args: $1 file, $2 key
  # Uses openssl if present.
  if ! command -v openssl >/dev/null 2>&1; then
    return 1
  fi
  openssl dgst -sha256 -hmac "$2" "$1" 2>/dev/null \
    | awk '{print $NF}'
}

ecl_check_integrity() {
  local env_path="$1"
  local env_dir
  env_dir="$(cd "$(dirname "$env_path")" && pwd)"

  local method value apath payload_path
  method="$(jq -r '.integrity.method // ""' "$env_path")"
  value="$(jq -r '.integrity.value  // ""' "$env_path")"
  apath="$(jq -r '.artifact.path    // ""' "$env_path")"

  # I-1: integrity.value is 64-char lowercase hex.
  if printf '%s' "$value" | grep -Eq '^[0-9a-f]{64}$'; then
    ecl_record "I-1" "MUST" "ok" "integrity_value_hex64" "" "$env_path"
  else
    ecl_record "I-1" "MUST" "fail" "integrity_value_hex64" "got: ${value:-<empty>}" "$env_path"
    return 0
  fi

  # Resolve payload path. artifact.path is relative to the consumer
  # project; we attempt resolution relative to the envelope's directory
  # first (the typical co-located sidecar layout), then relative to the
  # working directory if that fails.
  if [ -f "$env_dir/$(basename "$apath")" ]; then
    payload_path="$env_dir/$(basename "$apath")"
  elif [ -f "$apath" ]; then
    payload_path="$apath"
  elif [ -f "$env_dir/$apath" ]; then
    payload_path="$env_dir/$apath"
  else
    ecl_record "I-2" "MUST" "fail" "payload_resolvable" "artifact.path=$apath unresolved" "$env_path"
    return 0
  fi

  # I-2: payload exists and is readable.
  if [ ! -r "$payload_path" ]; then
    ecl_record "I-2" "MUST" "fail" "payload_resolvable" "$payload_path not readable" "$env_path"
    return 0
  fi
  ecl_record "I-2" "MUST" "ok" "payload_resolvable" "" "$env_path"

  # I-3: integrity recomputation matches.
  case "$method" in
    sha256)
      local computed
      computed="$(ecl_compute_sha256 "$payload_path")"
      if [ "$computed" = "$value" ]; then
        ecl_record "I-3" "MUST" "ok" "integrity_match" "" "$env_path"
      else
        ecl_record "I-3" "MUST" "fail" "integrity_match" "expected=$value got=$computed" "$env_path"
      fi
      ;;
    hmac-sha256)
      if [ -z "${ECL_HMAC_KEY:-}" ]; then
        ecl_record "I-3" "MUST" "warn" "integrity_match" "ECL_HMAC_KEY unset; HMAC unverifiable per §6.2.3" "$env_path"
      else
        local computed
        computed="$(ecl_compute_hmac_sha256 "$payload_path" "$ECL_HMAC_KEY")"
        if [ "$computed" = "$value" ]; then
          ecl_record "I-3" "MUST" "ok" "integrity_match" "" "$env_path"
        else
          ecl_record "I-3" "MUST" "fail" "integrity_match" "hmac mismatch" "$env_path"
        fi
      fi
      ;;
    *)
      ecl_record "I-3" "MUST" "fail" "integrity_method_supported" "method=$method (expected sha256|hmac-sha256)" "$env_path"
      ;;
  esac

  # I-4 (SHOULD): artifact.size_bytes matches actual file size.
  local declared_size actual_size
  declared_size="$(jq -r '.artifact.size_bytes // 0' "$env_path")"
  actual_size="$(wc -c < "$payload_path" | tr -d '[:space:]')"
  if [ "$declared_size" = "$actual_size" ]; then
    ecl_record "I-4" "SHOULD" "ok" "size_bytes_match" "" "$env_path"
  else
    ecl_record "I-4" "SHOULD" "warn" "size_bytes_match" "declared=$declared_size actual=$actual_size" "$env_path"
  fi

  # I-5 (SHOULD, ECL v1.1 §6.2.6): warn when trust_level=high AND
  # integrity.method=sha256. RECOMMENDED is hmac-sha256 at high trust.
  # Backward-compatible: v1.0 envelopes that combine high + sha256 stay
  # conformant; the warn is non-blocking.
  local trust_level
  trust_level="$(jq -r '.constraints.trust_level // "standard"' "$env_path")"
  if [ "$trust_level" = "high" ] && [ "$method" = "sha256" ]; then
    ecl_record "I-5" "SHOULD" "warn" "hmac_recommended_at_high_trust" \
      "trust_level=high + integrity.method=sha256 — RECOMMENDED hmac-sha256 (ECL v1.1 §6.4)" \
      "$env_path"
  else
    ecl_record "I-5" "SHOULD" "ok" "hmac_recommended_at_high_trust" "" "$env_path"
  fi
}
