# ECL — Drift register

**Version:** 2.0.0
**Status:** Active
**Spec anchor:** [`spec/ecl-2.0.md` §7.4](../spec/ecl-2.0.md)

## Preamble

A **drift** is a case where the ECL specification is **stricter than
what live emitters do**, or — symmetrically — where live emitters do
something the spec under-specifies. Drifts are tracked here so that
conformance checkers, SDK maintainers, and downstream Eidolon authors
share a single source of truth about what is "spec on paper" versus
"spec in practice".

Each drift is assigned a stable identifier `D-N` (zero-padded as
`D-01`, `D-02`, … once entries exist) and travels through a four-stage
lifecycle:

```
warn-only-window  →  SHOULD  →  MUST  →  retired
```

- **warn-only-window** — conformance checkers emit a warn-level result
  (`exit 4`, gate code recorded) without failing the build. The
  receiver community has time to align without breaking CI.
- **SHOULD** — promoted to a SHOULD-level conformance gate. Conformance
  emits exit 3 (build still passes locally; CI may gate on it).
- **MUST** — promoted to a MUST-level conformance gate. Conformance
  emits exit 2 and the build fails. A normative spec edit lands at the
  same SemVer minor bump.
- **retired** — emitters universally comply; the gate is removed from
  the conformance checker and the entry is moved to the historical
  section.

This register exists because v1.0 shipped with a placeholder
`spec/ecl-1.0.md` §7.4 stub ("No drifts at v1.0.0"). v1.1 replaced the
stub with a forward pointer to this document. v2.0 closes DC-1 and DC-3
(see historical section) and adds D-02 and D-04 as new deferred entries.

---

## Entry schema

Every `D-N` entry is a Markdown block whose fields match the YAML
shape below. Authors MAY format the entry as a definition list or a
table; the field set is normative.

| Field | Type | Description |
|---|---|---|
| `id` | string | `D-N`, monotonically assigned in order of discovery. |
| `title` | string | One-line summary of the drift. |
| `discovered_at` | RFC 3339 timestamp | When the drift was first observed. |
| `discovered_via` | enum | `conformance-checker` \| `live-emit` \| `external-report`. |
| `evidence` | array of strings | Each item is a `path:line` reference, an envelope ID, or a trace-event pointer. |
| `spec_section` | string | The §-anchor in the current spec the drift contradicts or under-specifies. |
| `warn_only_window.opened_at` | version | The spec version at which the warn-only window opened (e.g. `v2.0.0`). |
| `warn_only_window.target_promotion` | enum | `SHOULD` \| `MUST` — the intended next stage. |
| `warn_only_window.target_version` | version | The spec version the promotion targets (e.g. `v2.1.0`). |
| `conformance_gate` | string | The gate ID assigned by the conformance checker (e.g. `I-5`, `S-3`). |
| `status` | enum | `open` \| `promoted` \| `retired`. |
| `notes` | string | Free-form prose — rationale, debate, links to issues. |

---

## Governance

### Adding a drift

Anyone observing a real-world emitter behaviour that conflicts with
the spec MAY open a PR adding an entry to this file. The PR **MUST**
include:

1. A populated entry block per the schema above.
2. **Evidence** — at least one concrete reference: a fixture envelope,
   a trace-event line, a conformance-checker output, or a screenshot
   of a live host. Speculative drifts without evidence are rejected.
3. **A proposed conformance gate ID** if one does not already exist.
   New IDs continue the existing namespaces (`E-`, `C-`, `I-`, `D-`,
   `S-`); reviewers MAY rename the gate before merge.

The PR is reviewed by an Eidolons maintainer and lands on `main` when
the entry is well-formed. Adding a drift does **not** require a spec
text edit; the spec edits land at promotion time.

### Warn-only window

When a drift entry merges with `status: open`, the conformance checker
emits a **warn-level** result (`exit 4`) on any envelope matching the
drift condition. The TS SDK mirrors the warn into the `warnings[]`
array of `envelopeVerify` results. The build does **not** fail during
the warn-only window; consumers see the warn but their CI stays green.

Default warn-only-window duration: **one minor SemVer cycle**.
Drifts opened at `v2.0.0` target `v2.1.0` for promotion unless the
entry's `target_version` explicitly defers further.

### Promotion (warn → SHOULD → MUST)

Promotion requires:

1. A SPECTRA spec cycle that authors a normative §-anchor in the spec.
2. A bump of the spec's SemVer **minor** version (`v2.0.x` → `v2.1.0`,
   not a patch).
3. A bash conformance update that changes the gate's level
   (`warn` → `SHOULD` raises exit code to 3; `SHOULD` → `MUST` raises
   to 2).
4. A TS SDK update that mirrors the new gate level in `warnings[]` or
   `errors[]` as appropriate.
5. An entry update to this register: `status: promoted`,
   `warn_only_window` closed, a note recording the promoting spec
   version.

### Retirement

A drift is retired when:

1. Live-emit telemetry (or the absence of complaints over a minor
   version cycle) confirms universal compliance.
2. The conformance gate is removed from `conformance/lib/*.sh`.
3. The TS SDK `warnings[]` / `errors[]` references are removed.
4. The entry's `status` is set to `retired` and the block is moved to
   the historical section at the bottom of this file.

The spec text introduced at promotion **remains** — retirement removes
the gate, not the requirement.

---

## Open drifts

### D-02 — ISE contract-side defaults deferred

- **id:** D-02
- **title:** `handoff-contract.v1.json` has no `default_ise` field; ISE defaults cannot be expressed at the contract layer.
- **discovered_at:** 2026-05-13T00:00:00Z
- **discovered_via:** external-report
- **evidence:**
  - `.spectra/v2.0-phase2c.md:§DECISION-S1` — FINDING-008: no ISE-related field in any live contract today.
  - `schemas/handoff-contract.v1.json` — no `ise_defaults` or `default_ise` key present.
- **spec_section:** `spec/ecl-2.0.md §6.5` — ISE block defined at envelope level; contract-level defaults not specified.
- **warn_only_window:**
  - **opened_at:** v2.0.0
  - **target_promotion:** SHOULD
  - **target_version:** v2.1.0
- **conformance_gate:** (none yet — no gate fires when contract lacks a field; enforcement would be a new `S-N` gate)
- **status:** open
- **notes:** |
  Phase 2.C intentionally deferred adding `default_ise` to
  `handoff-contract.v1.json` (DECISION-S1 / FINDING-008). No live
  contract carries the field; adding it would require bumping
  `handoff-contract.v1.json` `$id` to `.v2.json` and validating 19
  contract YAML files. The spec text in §6.5 does not require contracts
  to carry ISE defaults; envelopes are responsible for ISE presence.
  Revisit when a concrete consumer emits a contract that specifies a
  required `assertion_grade` floor.

### D-04 — Python SDK does not ship `envelope_verify`

- **id:** D-04
- **title:** `reference-sdk/py` has no `envelope_verify` equivalent; Py-side consumers must use `conformance/check.sh` or the TS SDK verifier.
- **discovered_at:** 2026-05-13T00:00:00Z
- **discovered_via:** external-report
- **evidence:**
  - `.spectra/v2.0-phase2c.md:§DECISION-S3` — FORGE confirmed DEFER.
  - `reference-sdk/py/src/eidolons_ecl/` — no `envelope_verify.py` module present.
- **spec_section:** `spec/ecl-2.0.md §5` — verification is a conformance responsibility; the spec does not mandate a Py verifier, but SDK parity is a quality-of-life expectation.
- **warn_only_window:**
  - **opened_at:** v2.0.0
  - **target_promotion:** SHOULD
  - **target_version:** v2.1.0
- **conformance_gate:** (none — not a gate-level drift; affects SDK surface only)
- **status:** open
- **notes:** |
  The Py SDK ships `migrate/backfill.py` and `a2a_bridge/translator.py`
  (both still emit v1.0 format), plus `types.py` with v2.0 ISE types.
  A full `envelope_verify.py` is a feature addition, not a bump-coupled
  requirement. FORGE confirmed defer (DECISION-S3). Planned as an
  additive story in v2.1. Until then, Py consumers use
  `bash conformance/check.sh` or the TS SDK verifier via subprocess.

---

## Drift candidates (non-normative)

The following observations are **not yet** numbered drift-register
entries — they are pre-flagged for future review.

### DC-2 — Unused contract fields

- **Description:** `schemas/handoff-contract.v1.json` defines the
  fields `schema_ref`, `required_sections`, and
  `evidence_anchor_required`, but the bash `conformance/check.sh` does
  not validate or enforce any of them. They are accepted by the
  schema but invisible to the gate set.
- **Evidence:**
  [`.spectra/ts-sdk-port.md` GAP-2](../.spectra/ts-sdk-port.md);
  [`.idg/ts-sdk-phase1-chronicle.md`:90-92](../.idg/ts-sdk-phase1-chronicle.md)
  ("**[GAP-2]** Contract fields `schema_ref`, `required_sections`,
  `evidence_anchor_required` deferred until a real consumer exercises
  them.").
- **Spec section affected:** §3 hand-off contracts.
- **Promotion trigger:** **the first consumer that exercises them.**
  When an Eidolon emits a contract that depends on `schema_ref`
  resolution (or on `evidence_anchor_required = true` blocking an
  envelope), the conformance gate set must grow a `C-N` gate to
  enforce it.
- **Notes:** Deferred from Phase 1.A under TS SDK port; revisited if a
  Phase 2 Eidolon adoption needs the fields.

---

## Historical (retired) entries

### D-01 — Schema `$id` versioning lag (retired at v2.0.0)

- **id:** D-01
- **title:** All schemas carried `v1.0.0` `$id` URI despite spec being at v1.1/v1.2.
- **discovered_at:** 2026-04-28T00:00:00Z (as DC-1 in v1.1.0 PR)
- **discovered_via:** external-report
- **evidence:**
  - `schemas/envelope.v1.json` `$id` line (pre-v2.0: pinned at `v1.0.0`).
  - `.spectra/v1.1-spec-bump.md` DECISION-S2 rationale.
- **spec_section:** `spec/ecl-1.1.md §1.1` envelope shape; `§3` contract shape.
- **closure:** v2.0.0 — all 12 schema `$id` URI path segments bumped from
  `/v1.0.0/` to `/v2.0.0/` as part of the v2.0 MAJOR bump (DECISION-S2 /
  FINDING-024 in `.spectra/v2.0-phase2c.md`). The first additive schema field
  (ISE block in `envelope.v2.json`) triggered the promotion condition.
- **status:** retired
- **notes:** |
  DC-1 tracked in the drift-candidates section since v1.1.0. Promotion
  condition was "the first additive schema field". ECL v2.0 adds the ISE
  block (`ise` property in `envelope.v2.json`), which satisfies the trigger.
  All schema `$id` values now read `/v2.0.0/`. ajv consumers that hardcoded
  the v1.0.0 URI must update their import paths — see
  `docs/migration-v1-to-v2.md` for the upgrade guide.

### D-03 — `envelopeVerify` shell-out C-1 EDGE_UNKNOWN parse mismatch (retired at v2.0.0)

- **id:** D-03
- **title:** TS `envelopeVerify` shell-out tests skipped due to stale comment about from-field parsing.
- **discovered_at:** 2026-04-30T00:00:00Z (as DC-3 in v1.1.0 PR)
- **discovered_via:** external-report
- **evidence:**
  - `.idg/ts-sdk-phase1-chronicle.md:77-84` — the [DISPUTED]/[ACTION] block.
  - `reference-sdk/ts/src/envelopeVerify.test.ts` — two `describe.skip`'d blocks (pre-v2.0).
- **spec_section:** `spec/ecl-1.1.md §1.1.1` envelope shape (from-field); `§3.2` edge-matching.
- **closure:** v2.0.0 — `conformance/lib/handoff-graph.sh:70` already reads
  `.from.eidolon` (not a slug string); the skip was based on a stale comment.
  Two `describe.skip` tests un-skipped in v2.0 phase2c (DECISION-S5) with
  a `bash + jq` availability guard for environments without the dev container.
- **status:** retired
- **notes:** |
  DC-3 tracked since v1.1.0. The bash checker was already correct; the
  skip was filed against a now-stale description of the bug. Un-skipping
  confirmed the tests pass in the dev container (bash + jq available).
  In stripped environments (plain node:22-bookworm-slim without jq),
  the tests skip gracefully via `hasBashAndJq()` guard.

---

## Provenance

- Drift candidates DC-1, DC-2, DC-3 enumerated in
  [`.spectra/v1.1-spec-bump.md` §S1.5](../.spectra/v1.1-spec-bump.md).
- D-01 (retired) traces to DC-1 / DECISION-S2.
- D-02 (open) traces to DECISION-S1 / FINDING-008 in
  [`.spectra/v2.0-phase2c.md`](../.spectra/v2.0-phase2c.md).
- D-03 (retired) traces to DC-3 / DECISION-S5.
- D-04 (open) traces to DECISION-S3 (FORGE consult confirmed DEFER) in
  [`.spectra/v2.0-phase2c-forge-consult.md`](../.spectra/v2.0-phase2c-forge-consult.md).
- Schema, lifecycle, and governance language anchored against
  [`spec/ecl-2.0.md` §7.4](../spec/ecl-2.0.md).
