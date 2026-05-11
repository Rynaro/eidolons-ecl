---
mission_id: ts-sdk-port-phase1
created_at: "2026-05-11T20:00:00Z"
authority: read-only
budget:
  view_file: 100
  search_text: 50
  list_dir: 200
output:
  scout_report: .atlas-scout/scout-report.md
  excerpt_store: .atlas-scout/memex.jsonl
handoff_target: spectra
---

# ATLAS mission — TS SDK port surface

## Context

The Eidolons Communication Layer (ECL) at `Rynaro/eidolons-ecl@main` currently ships a reference SDK in bash 3.2 under `reference-sdk/bash/`. The maintainer committed (`docs/tech-choice.md`, merged 2026-05-11) to a multi-language harness — Option F. Phase 1 of the harness roadmap (`harness-roadmap.md` §"Phase 1 — ECL v1.1") delivers a TypeScript SDK at `reference-sdk/ts/` with API parity to the bash helpers.

The maintainer has also directed that **all development happens inside Docker containers** (host security). The runtime artefact (npm package + vendor-as-single-file build) must remain portable.

This scout grounds the SPECTRA spec that follows. The scout is read-only and bounded — it does not propose implementation.

## DECISION_TARGET

> **What is the minimal set of files, APIs, runtime contracts, and external integrations needed to port the four bash SDK helpers (`envelope-build`, `envelope-verify`, `handoff-emit`, `trace-tail`) to a TypeScript SDK that preserves byte-equivalent envelope output and API parity with the bash reference, while keeping the bash SDK as the canonical reference?**

## Sub-questions (Phase L drivers)

1. **API surface** — what is the full flag/argument surface of each of the four bash helpers? Where is each flag consumed? What is the default for each?
2. **Schema dependency** — which JSON Schemas under `schemas/` does each helper read? What `$ref` resolution does each helper require? What `additionalProperties` posture does each schema take?
3. **Contract dependency** — which contracts under `contracts/` does each helper consume? Which fields does it read (`performatives_allowed`, `trust_level`, `artifacts[*].schema_ref`, `context_delta.token_budget_max`)?
4. **Side-effect surface** — what does each helper write to disk? Where? With what filename conventions? What atomicity guarantees does the bash version provide (e.g., `mv -n` to detect collision)?
5. **External tool dependencies** — what does each helper shell out to (`jq`, `yq`, `shasum`, `uuidgen`, `python3 -c`)? Are these required or fallback?
6. **Conformance integration** — what is the relationship between `envelope-verify.sh` and `conformance/check.sh`? Does the TS SDK need to reimplement the conformance logic or shell to the bash checker?
7. **Trust-level + integrity** — how does the bash SDK compute `integrity.value` (sha256 of which bytes? canonical form? trailing newline handling?)? How is `hmac-sha256` planned for v1.1 (per `harness-roadmap.md` S1.4)?
8. **UUID v7** — does the bash SDK emit UUIDv4 or UUIDv7 for `message_id`/`thread_id`? What library does the TS port use?
9. **Trace JSONL** — what is the schema of trace events? Where are they appended? What is the rotation policy?
10. **Worked examples** — which examples under `examples/` exercise the SDK? Which envelopes are valid fixtures the TS SDK can use as round-trip tests?

## Scope

### IN scope (read-only)

- `reference-sdk/bash/*.sh` — the four helpers + README.
- `conformance/check.sh` and `conformance/lib/*.sh` — for verify-side integration.
- `schemas/envelope.v1.json`, `schemas/performative.v1.json`, `schemas/handoff-contract.v1.json`, `schemas/per-eidolon/_base-profile.v1.json`, `schemas/per-eidolon/*.v1.json` — the schemas the SDK validates against.
- `contracts/*.yaml` — the 18 contracts in scope (10 v1.0 + 8 v1.0.1).
- `spec/ecl-1.0.md` — §1 envelope, §2 performatives, §3 contracts, §4 context_delta, §5 trace, §6 integrity, §7 versioning.
- `examples/atlas-spectra-apivr-chain/` and `examples/apivr-vigil-escalation/` — worked-example fixtures.
- `docs/tech-choice.md` — the Phase 0 decision committing to the layout + versioning.
- `harness-roadmap.md` Phase 1 stories (informational; read so the SPECTRA spec scope matches).

### OUT of scope

- Per-Eidolon repos (ATLAS / SPECTRA / APIVR-Δ / VIGIL / IDG / FORGE). The SDK is host-agnostic; per-Eidolon adoption is downstream.
- `reference-sdk/py/` (Phase 2 — Python eval framework).
- The runtime engine / observability work (Phase 3).
- HMAC promotion implementation details (only the spec position).

## Hand-off target

`SPECTRA` — to author a decision-ready spec for the TS SDK port, including stories for the container infrastructure (Dockerfile.dev, compose, Makefile) and the npm + vendor-as-single-file build outputs.

## Notes for the scout

- TRANCE not authorized: surface < 25 files; G1 does not fire. Standard ATLAS tier with a single Locate phase.
- Bounded ACI per the budgets above.
- Every claim in `scout-report.md` MUST carry `path:line` evidence anchors with H/M/L confidence tiers.
- The `[DECISION]` markers reserved for SPECTRA to resolve are: D-1 ajv major version (v8 confirmed in tech-choice or open?); D-2 vendor-build tool (tsup / unbuild / rollup); D-3 trace JSONL writer atomicity (append vs O_APPEND vs flock); D-4 conformance integration (TS reimplementation or shell-out). Flag these as GAPs if the answer isn't in the read material; do NOT decide.
