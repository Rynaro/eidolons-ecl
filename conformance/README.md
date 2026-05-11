# Conformance checker

Standalone bash 3.2 conformance checker for ECL v1.0. No runtime
dependency on the nexus or any Eidolon repo.

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

The full gate list at v1.0:

| Gate | Level | Asserts |
|---|---|---|
| E-1 | MUST | envelope is valid JSON |
| E-2 | MUST | required §1.1 fields are present |
| E-3 | MUST | `envelope_version` matches `^1\.[01](\.\d+)?$` (v1.0 and v1.1 envelopes accepted) |
| E-4 | MUST | `performative` is one of the ten enumerated values |
| E-5 | MUST | `from.eidolon` and `to.eidolon` match the slug pattern |
| E-6 | MUST | `artifact.path` is relative and contains no `..` |
| E-7 | SHOULD | `edge_origin` is populated |
| E-8 | MUST | `trace.tier` is `standard` or `trance` |
| I-1 | MUST | `integrity.value` is 64-char lowercase hex |
| I-2 | MUST | payload is resolvable and readable |
| I-3 | MUST | recomputed digest matches `integrity.value` |
| I-4 | SHOULD | `artifact.size_bytes` matches actual file size |
| I-5 | SHOULD | warn when `trust_level=high` AND `integrity.method=sha256` — RECOMMENDED `hmac-sha256` (ECL v1.1 §6.2.6 / §6.4) |
| C-1 | MUST | a contract exists for the (`from`, `to`) edge |
| C-2 | MUST | `performative` is in `contract.performatives_allowed` |
| C-3 | MUST | `artifact.kind` is in `contract.artifacts[*].kind` |
| C-4 | SHOULD | envelope `edge_origin` matches `contract.edge_origin` |
| D-0 | SHOULD | `context_delta` is present |
| D-1 | MUST | `tokens_used ≤ token_budget` |
| D-2 | MUST | `tokens_used ≤ contract.context_delta.token_budget_max` |
| D-3 | SHOULD | summary length under 200 tokens (heuristic chars/4) |

## Running the test suite

```bash
bats conformance/tests/conformance.bats
```

Fixtures under `tests/fixtures/`:

- `conformant-handoff/` — passes all gates (exit 0)
- `missing-integrity/` — fails I-3 (exit 2)
- `undeclared-edge/` — fails C-1 (exit 2)
- `over-budget-context/` — fails D-1 + D-2 (exit 2)
