---
eidolon: atlas
version: 1.4.2
kind: scout-report
status: ready-for-spectra
created_at: "2026-05-11T20:30:00Z"
decision_target: "Minimal set of files, APIs, runtime contracts, and external integrations needed to port the four bash SDK helpers to TypeScript with byte-equivalent envelope output and API parity, while keeping bash canonical."
mission_id: ts-sdk-port-phase1
scope:
  entrypoints:
    - reference-sdk/bash/envelope-build.sh
    - reference-sdk/bash/envelope-verify.sh
    - reference-sdk/bash/handoff-emit.sh
    - reference-sdk/bash/trace-tail.sh
  modules:
    - conformance/check.sh
    - conformance/lib/{envelope,integrity,handoff-graph,context-budget}.sh
    - schemas/{envelope,performative,handoff-contract,context-delta,handoff-event}.v1.json
    - schemas/per-eidolon/_base-profile.v1.json
    - schemas/per-eidolon/{scout-report,spec,apivr-completion-report,root-cause-report,reasoning-report,repair-failed-report}.v1.json
    - contracts/*.yaml (18)
    - spec/ecl-1.0.md §§1-7
    - examples/atlas-spectra-apivr-chain, examples/apivr-vigil-escalation
    - docs/tech-choice.md
  excluded:
    - reference-sdk/py/ (Phase 2)
    - per-Eidolon repos
    - runtime engine, observability (Phase 3)
findings_count: 24
gaps_count: 6
confidence_distribution:
  H: 19
  M: 5
  L: 0
evidence_anchors_count: 40
---

# Scout Report — TS SDK port surface (Phase 1)

## Decision target

Minimal file/API/contract surface to port the four bash SDK helpers
(`envelope-build`, `envelope-verify`, `handoff-emit`, `trace-tail`) to a
TypeScript SDK at `reference-sdk/ts/` with API parity to bash; bash stays
canonical (`docs/tech-choice.md:21-23`; H).

## Findings (by sub-question)

### SQ-1 — API surface of the four helpers

- **F-1.1 (H)** `envelope-build.sh` accepts **22 flags**: `--artifact`, `--contract`, `--performative`, `--objective` (all four REQUIRED — `reference-sdk/bash/envelope-build.sh:89-92`); optional: `--message-id`, `--thread-id`, `--parent-id` (default `"null"` → JSON `null`), `--from-version` (default `0.0.0`), `--to-version` (`0.0.0`), `--kind` (default = `contract.artifacts[0].kind`, `:128-130`), `--summary` (default placeholder string, `:46`), `--tokens-used` (`0`), `--token-budget` (default = `contract.context_delta.token_budget_max` else `4000`, `:131-133`), `--confidence` (`0.5`), `--trust-level` (default = `contract.trust_level // "standard"`, `:134-136`), `--host` (`$ECL_HOST` else `"raw"`, `:51`), `--model` (`$ECL_MODEL` else `"unknown"`, `:52`), `--tier` (`"standard"`, `:53`), `--integrity-method` (`"sha256"`, `:54`).
- **F-1.2 (H)** Outputs envelope JSON to **stdout only**; exit codes: 0 success, 1 bad usage, 2 integrity computation failure (`reference-sdk/bash/envelope-build.sh:32`, `:159`, `:174`).
- **F-1.3 (H)** `envelope-verify.sh` accepts 4 flags: `--envelope` (REQUIRED), `--artifact` (informational; verifier resolves from envelope dir anyway), `--contracts DIR`, `--json` (`reference-sdk/bash/envelope-verify.sh:6-32`). It is a **thin `exec` wrapper** over `conformance/check.sh` (`:43-56`).
- **F-1.4 (H)** `handoff-emit.sh` accepts `--artifact` (REQUIRED), `--trace-dir` (default `.eidolons/.trace`, `:52`); all other flags are passed through to `envelope-build.sh` via a `PASSTHROUGH` array (`reference-sdk/bash/handoff-emit.sh:24-41`).
- **F-1.5 (H)** `trace-tail.sh` accepts `--trace-dir` (default `.eidolons/.trace`, `:20`), `--thread`, `--from`, `--to`, `--follow` (`reference-sdk/bash/trace-tail.sh:30-40`); builds a `jq` filter from `--from`/`--to` and pipes through `jq -c` (`:60-72`).

### SQ-2 — Schema dependency

- **F-2.1 (H)** `envelope-build.sh` does **not** validate against any schema at emit time; it only reads `contract` YAML via `yaml_to_json` and uses `jq -n` to construct the envelope (`reference-sdk/bash/envelope-build.sh:119-245`). Validation is deferred to `envelope-verify.sh` → `conformance/check.sh`.
- **F-2.2 (H)** `conformance/check.sh` does **structural-field checks via `jq`, not full JSON Schema validation** — comment at `conformance/check.sh:32-34` says "ajv-cli or python -m jsonschema for full JSON Schema validation (falls back to structural field checks via jq)" — but the lib functions implement only structural checks (`conformance/lib/envelope.sh:14-92`). No ajv call exists today. (See [GAP-1].)
- **F-2.3 (H)** Schema `$ref` chain inside `envelope.v1.json`: top-level uses `#/$defs/agentRef` (internal, `schemas/envelope.v1.json:181-199`); cross-file `$ref` to `performative.v1.json#/$defs/performative` (`:46`, `:114`) and to `context-delta.v1.json` (`:92`). The contract schema (`schemas/handoff-contract.v1.json:38`) also references `performative.v1.json`. Per-Eidolon profiles use `allOf` referencing `_base-profile.v1.json` (e.g. `schemas/per-eidolon/scout-report.v1.json:7`).
- **F-2.4 (H)** All schemas declare `$schema: "https://json-schema.org/draft/2020-12/schema"` (`schemas/envelope.v1.json:2`). All `$id`s are GitHub URLs not resolvable as live refs; ajv must be configured to resolve by `$id` against locally-loaded schema bundle, **not by HTTP**.
- **F-2.5 (H)** `additionalProperties` posture is mixed: envelope is `additionalProperties: false` BUT carries a `patternProperties: ^x_[a-z][a-z0-9_]*$` for vendor extensions (`schemas/envelope.v1.json:175-180`). Sub-objects (`artifact`, `integrity`, `trace`, `constraints`, `expected_response`, `agentRef`, `context-delta`) all set `additionalProperties: false`. The `_base-profile.v1.json` permits `additionalProperties: true` (`schemas/per-eidolon/_base-profile.v1.json:44`).
- **F-2.6 (H)** `handoff-contract.v1.json` uses `allOf` + `if/then` for the `edge_origin: implicit` ⇒ `notes` required rule (`schemas/handoff-contract.v1.json:96-101`); ajv must compile with `strict: false` or `allowMatchingProperties: true` since the `notes` property is also defined at the top level.

### SQ-3 — Contract dependency

- **F-3.1 (H)** `envelope-build.sh` reads from contract: `.from`, `.to`, `.edge_origin`, `.artifacts[0].kind` (only when `--kind` not supplied), `.context_delta.token_budget_max`, `.trust_level` (`reference-sdk/bash/envelope-build.sh:125-136`).
- **F-3.2 (H)** Conformance checker reads from contract: `.performatives_allowed` (`conformance/lib/handoff-graph.sh:88-89`), `.artifacts[*].kind` (`:97-99`), `.edge_origin` (`:107-108`), `.context_delta.token_budget_max` (`conformance/lib/context-budget.sh:34-35`). `.artifacts[*].schema_ref`, `.required_sections`, and `.evidence_anchor_required` are defined in the schema (`schemas/handoff-contract.v1.json:41-68`) but **not consumed** by any current SDK helper or conformance lib. (See [GAP-2].)
- **F-3.3 (H)** Contracts live as 18 `.yaml` files (10 v1.0 + 8 v1.0.1 FORGE laterals) in `contracts/` (`contracts/README.md:10-46`); 3 vigil-inbound edges deferred (`:48-62`).
- **F-3.4 (H)** Per-edge contract example, `contracts/atlas-to-spectra.yaml:1-22`: `contract_version: "1.0"`, `performatives_allowed: [PROPOSE, INFORM, REFUSE]`, `artifacts[0]: {kind: scout-report, schema_ref: ../schemas/per-eidolon/scout-report.v1.json, required_sections: [decision_target, findings, gaps, scope], evidence_anchor_required: true}`, `context_delta.token_budget_max: 4000`, `trust_level: standard`.

### SQ-4 — Side-effect surface

- **F-4.1 (H)** `envelope-build.sh` has **no disk side effects** — stdout only.
- **F-4.2 (H)** `envelope-verify.sh` has **no disk side effects** — exec's checker.
- **F-4.3 (H)** `handoff-emit.sh` writes exactly two artefacts: (a) `<artifact>.envelope.json` next to the artefact (`reference-sdk/bash/handoff-emit.sh:58`, `:66`); (b) one JSONL line appended to `<trace-dir>/<thread_id>.jsonl` (`:80-97`). Trace dir defaults to `.eidolons/.trace`; `mkdir -p` is unconditional (`:52-53`).
- **F-4.4 (M)** Filename convention: envelope sidecar is `<basename>.envelope.json`; spec mandates this (`spec/ecl-1.0.md:62-64`). Trace JSONL is `<thread_id>.jsonl` (`spec/ecl-1.0.md:373-376`).
- **F-4.5 (M)** **No explicit atomicity guarantee in bash.** `printf ... > $PATH` overwrites (not `mv -n`), and `>> $TRACE_FILE` is a raw shell append with no flock — concurrent emits to the same thread file can interleave bytes. The spec itself does not impose atomicity (`spec/ecl-1.0.md:370-386`). (See [DECISION] D-3 reserved for SPECTRA.)
- **F-4.6 (H)** `trace-tail.sh` requires `$TRACE_DIR` to exist; exits 1 otherwise (`reference-sdk/bash/trace-tail.sh:42-45`). Uses `tail -F` for follow mode (`:70`).

### SQ-5 — External tool dependencies

- **F-5.1 (H)** `envelope-build.sh` shells to: `yq` (required path, with python3+PyYAML fallback, `:103-117`), `jq` (required for the `jq -n` builder, `:190`), `shasum` or `sha256sum` (one required, `:154-160`), `uuidgen` (preferred; `od /dev/urandom` fallback, `:139-146`), `openssl` (only when `--integrity-method hmac-sha256`, `:167-171`), `date -u` (RFC3339 timestamp, `:180`), `wc -c`, `tr`, `awk`, `basename`.
- **F-5.2 (H)** `handoff-emit.sh` shells to: `jq` (for stdout-parse of build output, `:69-77`), `date -u` (`:78`), `mkdir`. Inherits all `envelope-build.sh` deps.
- **F-5.3 (H)** `trace-tail.sh` shells to: `jq`, `find`, `sort`, `cat`, `tail -F`.
- **F-5.4 (H)** Conformance checker adds: `grep -Eq` for regex (`conformance/lib/envelope.sh:59-60`), `awk` for JSON escaping (`conformance/check.sh:291-307`).
- **F-5.5 (H)** README declares hard deps: bash 3.2+, jq, shasum/sha256sum, uuidgen-or-fallback, yq-or-python3-yaml (`reference-sdk/bash/README.md:14-22`). openssl optional (`:23-25`).

### SQ-6 — Conformance integration

- **F-6.1 (H)** `envelope-verify.sh` is a **15-line thin wrapper** that builds a path to `conformance/check.sh` via `SDK_DIR/../..` (`reference-sdk/bash/envelope-verify.sh:43-45`) and `exec bash "$CHECK" "$ENVELOPE" $CONTRACTS_FLAG $JSON_FLAG` (`:56`).
- **F-6.2 (H)** Checker accepts a single envelope OR a directory of envelopes (`conformance/check.sh:182-201`); recursive find on `*.envelope.json`. Output modes: human and `--json`. Exit codes 0/1/2/3/4 (`:286-287`, `conformance/README.md:42-48`).
- **F-6.3 (H)** Checker is structured as four gate libraries:`E-` (envelope, `conformance/lib/envelope.sh`), `I-` (integrity, `conformance/lib/integrity.sh`), `C-` (contracts, `conformance/lib/handoff-graph.sh`), `D-` (context-delta, `conformance/lib/context-budget.sh`). Each lib is sourced and exposes one `ecl_check_*` function (`conformance/check.sh:170-178`, `:208-213`). Full gate table at `conformance/README.md:62-85` (20 gates).
- **F-6.4 (M)** TS reimplementation vs. shell-out: ambient code does not commit either way. Shell-out preserves canonical-reference status (passes through bash); reimplementation gives container portability + parity tests across SDKs. (See [DECISION] D-4 reserved for SPECTRA.)

### SQ-7 — Trust-level + integrity

- **F-7.1 (H)** `integrity.value` for `method: sha256` is **lowercase hex SHA-256 of the artefact payload bytes** as written on disk — not the envelope JSON, not a canonical form, no trailing-newline manipulation (`reference-sdk/bash/envelope-build.sh:154-161`: `shasum -a 256 "$ARTIFACT" | awk '{print $1}'`). Conformance verifier recomputes identically (`conformance/lib/integrity.sh:13-21`, `:74-82`). Byte-equivalence in TS requires reading the artefact file as raw bytes with no transformation.
- **F-7.2 (H)** Pattern `^[0-9a-f]{64}$` enforced (`schemas/envelope.v1.json:78-82`, `:142-145`; `conformance/lib/integrity.sh:44`).
- **F-7.3 (H)** `artifact.sha256` and `integrity.value` are both derived from the same payload bytes and are equal in the bash builder output (`reference-sdk/bash/envelope-build.sh:205`, `:213` — both `--arg sha256 / --arg integrity_value` are set to `$INTEGRITY_VALUE`). The TS port should preserve this.
- **F-7.4 (H)** `hmac-sha256`: `openssl dgst -sha256 -hmac "$ECL_HMAC_KEY" "$ARTIFACT"` (`reference-sdk/bash/envelope-build.sh:171`). Spec marks HMAC OPTIONAL in v1.0 (`spec/ecl-1.0.md:444-448`). Phase 1 story **S1.4** promotes it from OPTIONAL to RECOMMENDED at `trust_level=high` and adds a `[WARN]` when `trust_level=high` AND `integrity.method=sha256` (`.spectra/harness-roadmap.md:149`).
- **F-7.5 (H)** Trust levels are an enum `low|standard|high` (`schemas/envelope.v1.json:103-106`); §6.3.2 forbids using `high` to bypass other normative constraints (`spec/ecl-1.0.md:484-485`).

### SQ-8 — UUID v7

- **F-8.1 (H)** Bash SDK **does not emit UUIDv7**. It calls `uuidgen` (system default — UUIDv4 on macOS/Linux) and lowercases it (`reference-sdk/bash/envelope-build.sh:139-146`). Fallback uses `od -x /dev/urandom` to fake a UUID-shaped string with no version bits (`:144`).
- **F-8.2 (H)** Spec **RECOMMENDS** UUIDv7 ("UUIDv7 RECOMMENDED" — `schemas/envelope.v1.json:29`; `spec/ecl-1.0.md:85`; `:144`-canonical example uses a `01926e3a-…` UUIDv7-shaped value), accepts UUIDv4. Validation uses `"format": "uuid"` (`schemas/envelope.v1.json:27-28`); the conformance checker does **not** enforce v7 (no version-bit check anywhere in `conformance/lib/`).
- **F-8.3 (M)** TS UUIDv7: no library choice exists in the read material — `uuid` v9+ supports v7 via `uuidv7()`. (See [GAP-3].)

### SQ-9 — Trace JSONL

- **F-9.1 (H)** Per-event schema: `ts, event, message_id, thread_id, from, to, performative, integrity_method` REQUIRED; `context_tokens, model, tier, verify_failure_code` OPTIONAL (`schemas/handoff-event.v1.json:6-19`). `event` enum: `emit|receive|verify_pass|verify_fail` (`:23-26`). `from`/`to` strings match `^[a-z][a-z0-9-]*@(\d+\.\d+\.\d+|n/a)$` (`:36-43`).
- **F-9.2 (H)** Bash writes only `emit` events (`reference-sdk/bash/handoff-emit.sh:82-97`). Spec §5.1.2 SHOULD-receive events and verify_pass/verify_fail events are not produced by any current helper.
- **F-9.3 (H)** Location: `.eidolons/.trace/<thread_id>.jsonl` relative to consumer project (`spec/ecl-1.0.md:373-376`).
- **F-9.4 (H)** Rotation policy: **MAY rotate after thread closed**; senders/receivers SHALL NOT rely on historical trace persisting beyond active thread (`spec/ecl-1.0.md:382-386`). No automatic rotation in the bash SDK.
- **F-9.5 (M)** `verify_failure_code` enum has 7 values (`schemas/handoff-event.v1.json:60-69`); `verify_fail` event REQUIRES it via `if/then` (`:74-78`). No current helper writes verify events.

### SQ-10 — Worked examples

- **F-10.1 (H)** Two example chains:
  - `examples/atlas-spectra-apivr-chain/run.sh` — ATLAS → SPECTRA → APIVR-Δ → IDG, **3 PROPOSE envelopes** sharing one `thread_id`, parent_id chained (`examples/atlas-spectra-apivr-chain/run.sh:20-71`).
  - `examples/apivr-vigil-escalation/run.sh` — APIVR-Δ ESCALATE → VIGIL PROPOSE → APIVR-Δ ACKNOWLEDGE, 3 envelopes (`examples/apivr-vigil-escalation/run.sh:20-88`).
- **F-10.2 (H)** Each `run.sh` ends with `conformance/check.sh "$EX_DIR" --level=MUST` (`examples/atlas-spectra-apivr-chain/run.sh:75`; `examples/apivr-vigil-escalation/run.sh:92`). Both must exit 0 for the example to pass. These are the **canonical round-trip fixtures** for the TS SDK: TS-emitted envelopes against these contracts/artefacts should pass `check.sh` byte-for-byte.
- **F-10.3 (H)** Examples include valid Markdown payloads with frontmatter conforming to per-Eidolon profiles, e.g. `examples/atlas-spectra-apivr-chain/scout-report.md:1-18` (atlas+1.4.2+scout-report; H/M/L distribution).
- **F-10.4 (H)** Generated envelopes are **gitignored**: `examples/*/.eidolons/`, `examples/*/*.envelope.json`, `examples/apivr-vigil-escalation/ack.md` (`.gitignore:14-19`). Confirms they are regenerated each run.

## Cross-cutting findings

- **F-X.1 (H)** Spec is **opt-in** for v1.0 (`spec/ecl-1.0.md:30-32`). Eidolons that do not emit envelopes remain EIIS-conformant.
- **F-X.2 (H)** ECL_VERSION file declares `1.0` at repo root (`ECL_VERSION:1`); read by `conformance/check.sh:122-128` to set `TARGET_VERSION`. Phase 1 will bump this to `1.1`.
- **F-X.3 (H)** Tech-choice committed (`docs/tech-choice.md:14-46`): TS SDK lives at `reference-sdk/ts/`; npm primary + vendor-as-single-file secondary; lock-step minor versioning with spec; Apache-2.0.
- **F-X.4 (H)** Phase 1 story S1.1 names the four TS APIs: `envelopeBuild`, `envelopeVerify`, `handoffEmit`, `traceTail`, ajv-validated (`.spectra/harness-roadmap.md:146`, `docs/tech-choice.md:151-158`).
- **F-X.5 (M)** No existing `package.json`, `tsconfig.json`, or `Dockerfile.dev` under `reference-sdk/ts/` — directory is empty (`ls /Users/henrique/workspace/oss/agents/eidolons-ecl/reference-sdk/ts/` returns no files). Greenfield for SPECTRA to spec.
- **F-X.6 (H)** Per-Eidolon profile JSONs use `$ref: "_base-profile.v1.json"` as a relative reference (`schemas/per-eidolon/scout-report.v1.json:7`). ajv needs the local schemas bundle loaded with matching `$id`s, or use `loadSchema` callback.

## Gaps

- **GAP-1 (H)** Current bash conformance checker performs **structural-field checks via jq, not full JSON Schema validation** despite the comment at `conformance/check.sh:32-34` suggesting ajv-cli or python-jsonschema as the intended path. The TS SDK could be the *first* implementation to do real JSON Schema 2020-12 validation. SPECTRA must decide whether `envelopeVerify` runs ajv before/after/instead of shelling to `check.sh`. (Relates to [DECISION] D-4.)
- **GAP-2 (H)** Contract fields `artifacts[*].schema_ref`, `required_sections`, and `evidence_anchor_required` are **defined in the contract schema but not consumed by any helper or conformance lib today** (`schemas/handoff-contract.v1.json:52-68`). The TS SDK has an opportunity to be the first consumer — but this is scope creep beyond bash parity. SPECTRA should decide whether v1.1 TS SDK adds these gates or defers.
- **GAP-3 (H)** No UUIDv7 library named anywhere in read material. Bash emits UUIDv4 via `uuidgen`; spec RECOMMENDS v7. SPECTRA must pick a TS library (`uuid` ≥ v9 supports v7) and decide whether TS upgrades to v7-by-default or matches bash behavior (v4).
- **GAP-4 (M)** No specification of TS error model. Bash uses exit codes (0/1/2). TS could throw, return Result types, or mirror exit codes via a CLI wrapper. The harness-roadmap.md S1.1 says "API parity" without defining what parity means for error semantics.
- **GAP-5 (M)** Docker container spec — mission §"Notes" requires all development inside containers but no Dockerfile or compose file is read material. Greenfield for SPECTRA.
- **GAP-6 (M)** Receive-side trace events (`receive`, `verify_pass`, `verify_fail`) are defined in `handoff-event.v1.json` but no bash helper emits them. TS verify could be the first writer; SPECTRA to decide.

## Reserved DECISION markers (for SPECTRA)

- **[DECISION] D-1 — ajv major version.** Tech-choice doc names "ajv" (`docs/tech-choice.md:64`, `:103`) but does not pin v6/v7/v8. v8 is current. Not in read material.
- **[DECISION] D-2 — vendor-build tool.** Doc commits to "npm package and/or vendor-as-single-file build" (`docs/tech-choice.md:128`) without naming tsup, unbuild, rollup, esbuild, etc.
- **[DECISION] D-3 — trace JSONL writer atomicity.** Bash uses raw shell append (`reference-sdk/bash/handoff-emit.sh:97`). Spec is silent. TS choices: `fs.appendFileSync` with `O_APPEND` (POSIX append-atomic for ≤PIPE_BUF), `proper-lockfile`/`flock`, or a queued writer. Not in read material.
- **[DECISION] D-4 — conformance integration.** TS reimplementation of all 20 gates with ajv, or shell out to `bash check.sh`, or hybrid (TS does E-/I- locally, shells out for C-/D-). Not in read material.

## Hand-off

SPECTRA — author a decision-ready spec for the TS SDK port at
`reference-sdk/ts/`. Stories: (a) project scaffolding (package.json, tsconfig,
Dockerfile.dev, compose, Makefile) — `apivr:` once spec'd; (b) four API
functions matching bash flag surface — `apivr:`; (c) ajv schema bundle loader
respecting `$id`-by-bundle resolution — `apivr:`; (d) round-trip parity
fixtures from `examples/*/run.sh` — `apivr:`; (e) npm + single-file build —
`apivr:`. Resolve D-1 through D-4 during Construct phase.
