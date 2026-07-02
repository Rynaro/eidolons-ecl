# Relationship to EIIS

[EIIS](https://github.com/Rynaro/eidolons-eiis) is the **install
contract** every Eidolon repository satisfies. ECL is the **wire-format
contract** every inter-Eidolon hand-off satisfies. They compose; they
do not overlap.

## Layer separation

| Layer | What it specifies | Lives in |
|---|---|---|
| EIIS | Install: repo layout, `install.sh` flag contract, manifest, host wiring | `eidolons-eiis/` |
| ECL  | Runtime hand-off: envelope, performatives, contracts, integrity, trace | `eidolons-ecl/` |
| Eidolon repo | Methodology, per-Eidolon artefact bodies | `Rynaro/{ATLAS,SPECTRA,…}` |
| Nexus | Roster, presets, CLI orchestration | `Rynaro/eidolons` |
| Consumer project | `eidolons.yaml`, `eidolons.lock`, installed Eidolons | user-owned |

EIIS knows nothing about runtime hand-offs. ECL knows nothing about
install layouts. The boundary is intentional: an Eidolon repo can
satisfy EIIS without emitting any ECL envelopes (v1.0 default), and a
project can be ECL-conformant about its emitted artefacts even if the
emitting tool is not an Eidolon at all.

## Composition points

These are the only places where EIIS and ECL touch:

1. **`ECL_VERSION` file at the Eidolon repo root.** Mirrors EIIS's
   `EIIS_VERSION` pattern. SHOULD-level under ECL §7.2. Since EIIS v1.4
   (§3.7.1), a declared `ECL_VERSION` is additionally copied verbatim to
   the install target with `role: "ecl-version"`.
2. **`install.manifest.json` MAY include an `ecl_version_emitted`
   field.** Optional metadata so the nexus can detect which Eidolons
   are emitting ECL envelopes. Still optional as of EIIS v1.4.
3. **`eidolons sync` warns on mismatch.** Nexus integration reads both
   `EIIS_VERSION` and `ECL_VERSION` and reports drift.

## Drift register

If real-world conformance discovers cases where the spec is stricter
than what live emitters do, those drifts are tracked in
[`CHANGELOG.md`](../CHANGELOG.md) under the next `[Unreleased]` entry,
following EIIS's `D-N` convention (`D-1`, `D-2`, …). v1.0 ships with
no drifts; entries will accumulate as implementors adopt.

## Versioning compatibility

ECL and EIIS version independently. v1.0 of one does not require any
specific version of the other. Recommended pairings:

| EIIS | ECL | Status |
|---|---|---|
| 1.4 | 2.0 | Recommended (current) |
| 1.2–1.3 | 1.x–2.0 | Supported (EIIS §4.6 ECL composition clause available from 1.2) |
| 1.0–1.1 | 1.0 | Supported (v1.0 EIIS Eidolons MAY emit ECL envelopes) |
| 1.5+ | 2.x | Forward-compatible (additive) |

A breaking change in either standard requires a MAJOR bump in that
standard alone; the other is unaffected.

## Why two standards

A single combined standard would have been smaller. We split them
because the audiences differ:

- **EIIS authors** are Eidolon authors and the nexus CLI. They care
  about install layout, manifest bytes, and idempotency.
- **ECL authors** are the host LLM (Claude Code, Cursor, Codex) and
  any tooling that consumes inter-Eidolon artefacts. They care about
  envelope shape, performative meaning, integrity, and trace lineage.

A combined standard would force every change through both review
audiences. Splitting lets each evolve at its own cadence.
