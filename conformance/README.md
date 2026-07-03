# Conformance checker

Standalone bash 3.2 conformance checker for ECL v2.0 (also accepts v1.x envelopes
per the §7.3 12-month compatibility window). No runtime dependency on the nexus or
any Eidolon repo.

The checker is **version-aware per envelope**, keyed on each envelope's
`envelope_version` field. It additionally understands the **ECL v2.1 (Draft,
adoption-gated)** gates: for an envelope that declares `envelope_version: "2.1"`,
gates **I-5** and **S-3** are enforced at **MUST** (fail, not warn) and the new
**S-4** shape gate runs. For envelopes declaring `≤ 2.0`, behaviour is
byte-identical to before — the v2.1 promotions never retro-tighten a v2.0/v1.x
envelope. `ECL_VERSION` stays `2.0` while 2.1 is Draft; the per-envelope gating
means no `--target-version` change is needed to exercise 2.1 envelopes.

## Hard requirements

- `bash` 3.2+ (the macOS system shell)
- `jq` (any reasonably modern version)
- `shasum` or `sha256sum`
- POSIX coreutils (`awk`, `grep`, `find`, `wc`, `head`, `tr`)
- `yq` OR `python3` with the `yaml` module — used to parse contract YAML.

## Optional

- `openssl` — required for HMAC verification when an envelope declares
  `integrity.method = hmac-sha256`. The HMAC key is read from the
  `ECL_HMAC_KEY` environment variable.
- `bats` — for running the test suite locally.

## Usage

```bash
# Validate everything under a directory:
bash conformance/check.sh path/to/.eidolons

# Validate a single envelope file:
bash conformance/check.sh path/to/scout-report.envelope.json

# Machine-readable output:
bash conformance/check.sh path/to/.eidolons --json

# Restrict reporting to MUST-level only:
bash conformance/check.sh path/to/.eidolons --level=MUST

# Use an alternate contracts directory (e.g. a vendored copy in another repo):
bash conformance/check.sh path/to/.eidolons --contracts /path/to/contracts
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All MUSTs pass at the declared `ECL_VERSION`. |
| 1 | Generic failure (missing dir, unreadable files, bad usage). |
| 2 | One or more MUST gates failed. |
| 3 | All MUSTs pass but one or more SHOULD gates failed. |
| 4 | All MUSTs pass; warn-only output for grandfathered drifts. |

## Gate IDs

Gates are namespaced by §:

| Prefix | § in spec | Library |
|---|---|---|
| `E-` | §1 (Envelope) | `lib/envelope.sh` |
| `I-` | §6 (Integrity) | `lib/integrity.sh` |
| `C-` | §3 (Contracts) | `lib/handoff-graph.sh` |
| `D-` | §4 (Context-delta) | `lib/context-budget.sh` |
| `S-` | §6.5 (ISE trust hierarchy) | `lib/ise.sh` |

The full gate list (v2.0 baseline; v2.1 deltas noted per row):

| Gate | Level | Asserts |
|---|---|---|
| E-1 | MUST | envelope is valid JSON |
| E-2 | MUST | required §1.1 fields are present |
| E-3 | MUST | `envelope_version` matches `^(1\.[012]\|2\.[01])(\.\d+)?$` (v1.0–v1.2 + v2.0 + v2.1 accepted; fixes latent v1.1/v1.2 rejection bug) |
| E-3.compat | INFO | v1.x envelope accepted under v2.x verifier (§7.3 window through 2027-05-13) |
| E-4 | MUST | `performative` is one of the ten enumerated values |
| E-5 | MUST | `from.eidolon` and `to.eidolon` match the slug pattern |
| E-6 | MUST | `artifact.path` is relative and contains no `..` |
| E-7 | SHOULD | `edge_origin` is populated |
| E-8 | MUST | `trace.tier` is `standard` or `trance` |
| I-1 | MUST | `integrity.value` is 64-char lowercase hex |
| I-2 | MUST | payload is resolvable and readable |
| I-3 | MUST | recomputed digest matches `integrity.value` |
| I-4 | SHOULD | `artifact.size_bytes` matches actual file size |
| I-5 | SHOULD (≤v2.0) / **MUST (v2.1)** | `trust_level=high` AND `integrity.method=sha256` — RECOMMENDED `hmac-sha256` (ECL §6.2.6 / §6.4). Warn (non-blocking) for ≤v2.0 envelopes; **fail (MUST)** for `envelope_version: "2.1"` envelopes. |
| C-1 | MUST | a contract exists for the (`from`, `to`) edge |
| C-2 | MUST | `performative` is in `contract.performatives_allowed` |
| C-3 | MUST | `artifact.kind` is in `contract.artifacts[*].kind` |
| C-4 | SHOULD | envelope `edge_origin` matches `contract.edge_origin` |
| D-0 | SHOULD | `context_delta` is present |
| D-1 | MUST | `tokens_used ≤ token_budget` |
| D-2 | MUST | `tokens_used ≤ contract.context_delta.token_budget_max` |
| D-3 | SHOULD | summary length under 200 tokens (heuristic chars/4) |
| S-1 | MUST | if `ise` present, `ise.assertion_grade` is present and is a valid enum value |
| S-2 | MUST | if `ise.receiver_authorization` present, field values are valid booleans |
| S-3 | SHOULD (≤v2.0) / **MUST (v2.1)** | `trust_level=high` AND `ise` absent — see §6.5.5. Warn (non-blocking) for ≤v2.0 envelopes; **fail (MUST)** for `envelope_version: "2.1"` envelopes. |
| S-4 | MUST (v2.1) | if `ise.verification` present on a v2.1 envelope: `fresh_context` boolean, `checker` matches the from/to slug pattern, `transcript_access` ∈ {`none`, `artifact-only`} — see §6.5.8. No-op for ≤v2.0 envelopes. |

## Running the test suite

```bash
bats conformance/tests/conformance.bats
```

Fixtures under `tests/fixtures/`:

v1.x fixtures (retained per §7.3 compatibility window):
- `conformant-handoff/` — passes all gates (exit 0)
- `missing-integrity/` — fails I-3 (exit 2)
- `undeclared-edge/` — fails C-1 (exit 2)
- `over-budget-context/` — fails D-1 + D-2 (exit 2)

v2.0 fixtures:
- `conformant-ise-v2/` — v2.0 envelope with full ISE block; passes all gates (exit 0)
- `ise-missing-hierarchy/` — v2.0 envelope with `ise` but missing `assertion_grade`; fails S-1 (exit 2)
- `v1-on-v2-compat/` — v1.2 envelope under v2.0 verifier; passes E-3, emits E-3.compat INFO (exit 0)
- `high-trust-sha256-v2/` — **regression guard**: v2.0 `trust_level=high` + `sha256` + no `ise`; still only WARNS on I-5 and S-3 (exit 4), proving the v2.1 promotions do not retro-tighten v2.0 envelopes.

v2.1 (Draft) fixtures:
- `conformant-ise-v2.1/` — v2.1 envelope with ISE + `ise.verification`; S-1/S-2/S-3/S-4 and I-5 all pass at MUST level (exit 0)
- `conformant-high-trust-v2.1/` — v2.1 `trust_level=high` + `hmac-sha256` + ISE + verification; passes I-5/S-3 (MUST) and I-3 (requires `ECL_HMAC_KEY`; the bats test skips if `openssl` is absent) (exit 0)
- `ise-verification-invalid-v2.1/` — v2.1 envelope whose `ise.verification.transcript_access` is an unknown value; fails S-4 (exit 2)
- `high-trust-no-ise-v2.1/` — v2.1 `trust_level=high` + `sha256` + no `ise`; fails both S-3 and I-5 at MUST level (exit 2)
