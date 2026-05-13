# Mission — ECL v2.0.0 (Phase 2.C, S2.3 ISE trust-hierarchy) surface inventory

**Repo:** `/Users/henrique/workspace/oss/agents/eidolons-ecl` (branch `main`, read-only).
**Consumer:** SPECTRA. Output is a decision-ready inventory of every surface
that must change to ship v2.0.0 + ISE fields + `$id` bump + DC-1 closure.
**Boundary:** inventory only — do NOT propose ISE field names/shapes.

## Sub-questions (must answer)

1. Spec surfaces — trust_level loci in `spec/ecl-1.2.md`; MUST/SHOULD gates.
2. Schema surfaces — every `schemas/*.json`, `$id` URI shape, breakage radius.
3. Contract surfaces — `contracts/*.yaml` `trust_level` defaults today.
4. SDK verifiers — bash (`conformance/lib/*.sh`), TS (`envelopeVerify.ts`),
   Py (verifier path; check whether one exists at v1.2.1).
5. Migration tooling — `reference-sdk/py/src/eidolons_ecl/migrate/`.
6. Backward-compatibility window (§7.3, 12 months).
7. Conformance fixtures — locking v1 shape.
8. Drift register — DC-1 closure; DC-2/DC-3 sibling status.
9. Per-Eidolon downstream blast — list six Eidolons (no proposal).

## Ground truth pointers

- `eidolons-ecl/.spectra/phase2-scoping.md` — Phase 2 split decisions, ISE
  shape stub, DC-1 closure plan ([DECISION-P2-1], [DECISION-P2-6]).
- `eidolons-ecl/.spectra/v1.1-spec-bump.md` — [DECISION-S2] (defer `$id`
  bump), [ACTION-1] (HMAC SHOULD→MUST), [ACTION-4] (re-evaluate at S2.3).
- `eidolons-ecl/docs/drift-register.md` — DC-1/DC-2/DC-3 candidates.
- `eidolons-ecl/CHANGELOG.md` — v1.2.1 trailer naming Phase 2.C.

## Constraints

- Inventory ≠ design. Every claim cites `path:line`.
- Out of scope: per-Eidolon repos (`Rynaro/ATLAS` etc).
- Final report ≤ 3000 tokens. Sibling envelope per ECL §1.

## [GAP]
Nexus harness-roadmap (`/Users/henrique/workspace/oss/agents/eidolons/.spectra/harness-roadmap.md`)
referenced by drift-register DC-1:185-186 and phase2-scoping.md:4 is
**not present** in the nexus checkout (`grep S2.3|ISE` returned no hits
under `.spectra/`). Mission proceeds using `eidolons-ecl/.spectra/phase2-scoping.md`
as the surrogate roadmap.
