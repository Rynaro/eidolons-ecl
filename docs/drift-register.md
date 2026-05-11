# ECL — Drift register

**Version:** 1.1.0
**Status:** Seed (empty at v1.1.0)
**Spec anchor:** [`spec/ecl-1.1.md` §7.4](../spec/ecl-1.1.md)

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
`spec/ecl-1.0.md` §7.4 stub ("No drifts at v1.0.0"). v1.1 replaces the
stub with a forward pointer to this document — see
[`spec/ecl-1.1.md` §7.4](../spec/ecl-1.1.md). All future drift entries
live here, not in the spec.

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
| `spec_section` | string | The §-anchor in `spec/ecl-1.1.md` (or a later spec version) the drift contradicts or under-specifies. |
| `warn_only_window.opened_at` | version | The spec version at which the warn-only window opened (e.g. `v1.1.0`). |
| `warn_only_window.target_promotion` | enum | `SHOULD` \| `MUST` — the intended next stage. |
| `warn_only_window.target_version` | version | The spec version the promotion targets (e.g. `v1.2.0`). |
| `conformance_gate` | string | The gate ID assigned by the conformance checker (e.g. `I-5`, `D-4`). |
| `status` | enum | `open` \| `promoted` \| `retired`. |
| `notes` | string | Free-form prose — rationale, debate, links to issues. |

### Example entry (illustrative — no `D-1` exists yet)

```yaml
id: D-1
title: <one-line>
discovered_at: "2026-MM-DDTHH:MM:SSZ"
discovered_via: conformance-checker
evidence:
  - conformance/tests/fixtures/<fixture>/envelope.json:<line>
  - .eidolons/.trace/<thread_id>.jsonl:<line>
spec_section: §<N>.<M>
warn_only_window:
  opened_at: v1.1.0
  target_promotion: SHOULD
  target_version: v1.2.0
conformance_gate: <gate-id>
status: open
notes: |
  <multi-line prose describing what was observed, why the spec text
  does not match, and what the proposed promotion would change.>
```

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
   New IDs continue the existing namespaces (`E-`, `C-`, `I-`, `T-`,
   `D-`); reviewers MAY rename the gate before merge.

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
Drifts opened at `v1.1.0` target `v1.2.0` for promotion unless the
entry's `target_version` explicitly defers further.

### Promotion (warn → SHOULD → MUST)

Promotion requires:

1. A SPECTRA spec cycle that authors a normative §-anchor in the spec.
2. A bump of the spec's SemVer **minor** version (`v1.1.x` → `v1.2.0`,
   not a patch).
3. A bash conformance update that changes the gate's level
   (`warn` → `SHOULD` raises exit code to 3; `SHOULD` → `MUST` raises
   to 2).
4. A TS SDK update that mirrors the new gate level in `warnings[]` or
   `errors[]` as appropriate.
5. An entry update to this register: `status: promoted`,
   `warn_only_window` closed, a note recording the promoting spec
   version.

Backward compatibility per [`spec/ecl-1.1.md` §7.3](../spec/ecl-1.1.md):
v1.0 envelopes remain valid under v1.1 receivers; promotion at v1.2 or
later applies to v1.2-emitted envelopes and beyond.

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

_No open drifts at v1.1.0._

---

## Drift candidates (non-normative)

The following observations are **not yet** numbered drift-register
entries — they are pre-flagged for future review. Each carries a
proposed promotion trigger; when the trigger fires, the candidate is
promoted to a numbered `D-N` entry via the workflow above.

### DC-1 — Schema `$id` versioning lag

- **Description:** All `schemas/*.json` files carry their original
  `v1.0.0` `$id` URI even though the spec is at v1.1.0. The HMAC
  promotion in v1.1 was prose-level only — no schema field added, no
  constraint tightened — so per [DECISION-S2] in
  [`.spectra/v1.1-spec-bump.md`](../.spectra/v1.1-spec-bump.md) the
  `$id`s were intentionally **not** bumped to avoid churn-heavy diffs.
- **Evidence:** `schemas/envelope.v1.json` `$id` line; the twelve total
  schema files (six core + six per-Eidolon) all pinned at
  `v1.0.0`. See [DECISION-S2] rationale in
  [`.spectra/v1.1-spec-bump.md`](../.spectra/v1.1-spec-bump.md).
- **Spec section affected:** §1.1 envelope shape; §3 contract shape.
- **Promotion trigger:** the **first additive schema field** (e.g.
  Phase 2 S2.3 ISE trust-hierarchy fields per
  [`harness-roadmap.md` §"Phase 2":168](../../eidolons/.spectra/harness-roadmap.md)).
  When that lands, `$id`s SHOULD bump to `v1.x.0` matching the spec
  minor version.
- **Notes:** ajv resolves cross-file `$ref`s by `$id`
  (`envelopeVerify.ts:128-200`). Changing `$id` requires a TS SDK
  rebuild and forces external vendors to update import paths — that
  cost is acceptable when a real schema change ships, not before.

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

### DC-3 — `envelopeVerify` shell-out C-1 EDGE_UNKNOWN parse mismatch

- **Description:** The TS `envelopeVerify` SDK shells out to
  `bash conformance/check.sh` for C-/D-gates per [DECISION] D-4 in
  Phase 1.A. The bash checker parses `envelope.from` as a **slug
  string** while the TS SDK emits `from` as an `agentRef` **object**.
  Two `envelopeVerify.test.ts` integration tests are
  `describe.skip`'d as a result; they fail with `C-1 EDGE_UNKNOWN` on
  a valid `atlas → spectra` envelope.
- **Evidence:**
  [`.idg/ts-sdk-phase1-chronicle.md`:77-84](../.idg/ts-sdk-phase1-chronicle.md)
  (the **[DISPUTED] / [ACTION]** block); the two `describe.skip`'d
  blocks in `reference-sdk/ts/src/envelopeVerify.test.ts`.
- **Spec section affected:** §1.1.1 envelope shape (from-field
  schema) and §3.2 contract edge-matching.
- **Promotion trigger:** **prior to v1.2.0 if not resolved.** Either
  the bash checker is updated to parse `from` as an object, or the
  TS SDK fixture shape is aligned with the slug-string behaviour. The
  v1.1.0 PR sidesteps this by running the new I-5 tests with
  `skipShellGates: true`.
- **Notes:** Tracked under
  [`.spectra/v1.1-spec-bump.md` ACTION-3](../.spectra/v1.1-spec-bump.md).
  This is the highest-priority candidate of the three — a real
  interop issue, not a hypothetical.

---

## Historical (retired) entries

_None yet._

---

## Provenance

- Drift candidates DC-1, DC-2, DC-3 enumerated in
  [`.spectra/v1.1-spec-bump.md` §S1.5](../.spectra/v1.1-spec-bump.md).
- DC-1 traces to [DECISION-S2] in that spec.
- DC-2 traces to
  [`.spectra/ts-sdk-port.md` GAP-2](../.spectra/ts-sdk-port.md) and
  [`.idg/ts-sdk-phase1-chronicle.md`:90-92](../.idg/ts-sdk-phase1-chronicle.md).
- DC-3 traces to
  [`.idg/ts-sdk-phase1-chronicle.md`:77-84](../.idg/ts-sdk-phase1-chronicle.md)
  and [`.spectra/v1.1-spec-bump.md` ACTION-3](../.spectra/v1.1-spec-bump.md).
- Schema, lifecycle, and governance language anchored against
  [`spec/ecl-1.1.md` §7.4](../spec/ecl-1.1.md) and
  [`.spectra/v1.1-spec-bump.md` §S1.5 `entry_schema`](../.spectra/v1.1-spec-bump.md).
