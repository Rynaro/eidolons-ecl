# Findings — ECL v2.0.0 / Phase 2.C surface inventory

All paths absolute. Every claim cites `path:line` ranges.

## Spec surfaces (sub-question 1)

### FINDING-001 — `constraints.trust_level` lives in §1.2 (not §6.3 only)
`spec/ecl-1.2.md:120` enumerates `constraints.{deadline_ts?, trust_level?}`
in the §1.2 "Optional but RECOMMENDED" table; the semantic definitions of
`low | standard | high` live at `spec/ecl-1.2.md:481-490` (§6.3 trust
levels table). The §6.3.2 MUST-NOT clause at line 495 anchors the trust
model: `trust_level=high` cannot bypass other normative constraints.
S2.3 will introduce a NEW envelope-level `ise` object that is **distinct
from but composes with** `constraints.trust_level` (see FINDING-018).

### FINDING-002 — §6.1 integrity table cross-references trust_level
`spec/ecl-1.2.md:447-452` (§6.1) — the `sha256` row says "Default for
trust_level ∈ {low, standard}", the `hmac-sha256` row says "RECOMMENDED
for trust_level=high". This table is the canonical trust→method binding
the I-5 gate enforces (FINDING-008).

### FINDING-003 — §1.1.1 envelope_version regex relaxes at v2.0
`spec/ecl-1.2.md:96-98` declares `^1\.[012](\.\d+)?$`. Per phase2-scoping
`.spectra/phase2-scoping.md:520` the v2.0 relaxation is
`^[12]\.\d+(\.\d+)?$` (v2.0 receivers accept v1.x for the §7.3 window).

### FINDING-004 — §7.3 12-month compatibility window already references v2
`spec/ecl-1.2.md:596-601` declares "≥ 12 months" backward-compat per minor
release; an aspirational note about v2.0 already lives at lines 599-601
("v2.0, when it arrives, SHALL ship a checker mode..."). Phase 2.C must
add an explicit "v2.0 receivers SHALL accept v1.x envelopes" paragraph
(scoping doc lines 538-539).

### FINDING-005 — §6.3.1/§6.3.2/§6.3.3 SHOULDs touch trust_level directly
`spec/ecl-1.2.md:492-500` — three SHOULD/MUST-NOT gates govern current
trust semantics. ISE adds a NEW subsection §6.5 per scoping doc
lines 522-541; existing §6.3 prose is **not** rewritten, only extended.

## Schema surfaces (sub-question 2)

### FINDING-006 — All twelve schema `$id`s carry `/v1.0.0/` in URL path
- core (six): `schemas/envelope.v1.json:3`,
  `schemas/performative.v1.json:3`, `schemas/context-delta.v1.json:3`,
  `schemas/handoff-contract.v1.json:3`, `schemas/handoff-event.v1.json:3`,
  `schemas/per-eidolon/_base-profile.v1.json:3`.
- per-eidolon (six): `schemas/per-eidolon/{apivr-completion-report,
  reasoning-report,repair-failed-report,root-cause-report,scout-report,
  spec}.v1.json:3`.
URI shape: `https://github.com/Rynaro/eidolons-ecl/blob/v1.0.0/schemas/<file>`.
The `/v1.0.0/` segment is a **path fragment** (git tag in raw-URL form),
NOT a query string. Phase 2.C bumps the segment to `/v2.0.0/` (scoping
lines 191-194). **Breakage radius:** ajv resolves cross-file `$ref`s by
`$id` (`reference-sdk/ts/src/envelopeVerify.ts:163-170`); changing a
single `$id` without updating `$ref`s elsewhere breaks compilation. Any
external vendor pinning by `$id` URI must update import paths.

### FINDING-007 — Only `envelope.v2.json` is a mandatory new file
Per scoping doc lines 201-210: Phase 2.C is **envelope-only**. Other
schemas (performative, contract, event, context-delta, base-profile)
stay at v1 unless additionally touched. New file required:
`schemas/envelope.v2.json` (adds `$defs.ise`, $id carries `/v2.0.0/`).
Filename convention `*.v2.json` co-exists with `*.v1.json` for the §7.3
window — mirrors the `spec/ecl-1.x.md` co-existence pattern
(`schemas/README.md:1-21` is currently scoped to v1.0 and must be
updated to enumerate the v2 sibling).

## Contract surfaces (sub-question 3)

### FINDING-008 — 19 contracts carry `trust_level`; none carry ISE today
`contracts/*.yaml` — sweep shows the `trust_level` field is used by all
19 edges (16 `standard`, 3 `high`: `apivr-to-vigil:21`, `vigil-to-apivr:21`,
`vigil-to-spectra:22`). No contract carries any ISE-related field
(no occurrences of `ise`, `segment_priority`, or `trust_hierarchy`
across `contracts/`). Phase 2.C scope (scoping doc line 210) is
**envelope-only**; contract schema is **NOT** bumped at v2.0 unless
SPECTRA decides to add a per-edge ISE default — currently no such
decision exists (this is one of the unknowns SPECTRA must close;
see GAP-A).

### FINDING-009 — `templates/handoff-contract-template.yaml` and
`templates/envelope-example.json` ship v1.0 shapes
`templates/envelope-example.json` is the canonical worked example; it
pins `envelope_version: "1.0"`. A v2 sibling
(`templates/envelope-v2-example.json`) is implied by the §1.3 worked-
example pattern (`spec/ecl-1.2.md:142-191`) but not enumerated in the
scoping doc — flag for SPECTRA confirmation.

## Reference-SDK envelope verifiers (sub-question 4)

### FINDING-010 — Bash conformance: E-3 regex still pinned at v1.0 ONLY
`conformance/lib/envelope.sh:38-40` reads `case "$v" in 1.0|1.0.*) ok ;;
*) fail`. This contradicts `conformance/README.md:67` which claims
`^1\.[012](\.\d+)?$`. The README was updated at v1.1/v1.2 but the bash
gate was **never updated** — current code rejects any v1.1/v1.2 envelope
as MUST-fail. Phase 2.C must (a) fix the latent stale regex (or treat
as in-flight at v1.2) AND (b) expand to `1.0|1.0.*|1.1|1.1.*|1.2|1.2.*|2.0|2.0.*`.
Likely combined with closing a **silent drift** (sibling of DC-1).

### FINDING-011 — `conformance/check.sh` hardcodes v1.0 in 5 sites
`conformance/check.sh:25` ("Exit codes (ECL v1.0 §7)"),
`:39` (`VERSION="1.0.0"`), `:131` (default `TARGET_VERSION="1.0"`),
`:134-141` (the `case "$TARGET_VERSION" in 1.0|1.0.*|1) ... 1.*)`
branch). All five need a v2.0 path; the entry-script `VERSION` constant
is the SDK self-version and should bump to `2.0.0`.

### FINDING-012 — `conformance/lib/integrity.sh:116-124` is the I-5 site
Reads `constraints.trust_level` via `jq -r '.constraints.trust_level //
"standard"'` (line 117), then warns on `high+sha256`. Phase 2.C will
likely (per `.spectra/v1.1-spec-bump.md:88` [ACTION-1]) promote I-5
SHOULD → MUST. The `ise` field, if S2.3 introduces a receive-side
rule like "envelope > payload", would slot into integrity.sh OR a new
`conformance/lib/ise.sh` library — current code has **zero** ISE-aware
logic.

### FINDING-013 — TS `envelopeVerify.ts` schema bundle pinned to v1
`reference-sdk/ts/src/envelopeVerify.ts:112-119` enumerates the six core
schema filenames literally (`envelope.v1.json`, `performative.v1.json`,
etc.). The `findRepoRoot` / `buildAjv` flow loads these by filename, then
indexes via `$id` (lines 163-170, 184-190). At v2 the bundle must add
`envelope.v2.json`, and `deriveEGate` (lines 736-762) must handle the
new ISE-pattern errors. The hardcoded basename `envelope.v1.json` at
line 168 is the dispatch site for "which schema validates this envelope".

### FINDING-014 — TS `envelopeBuild.ts` emits hardcoded v1.0 envelopes
`reference-sdk/ts/src/envelopeBuild.ts:208` (`envelope_version: "1.0"`)
and `:219` (`schema_version: "1.0"`) — both hardcoded. The build path
defaults `trust_level` from the contract (line 154-157) but **never**
emits an `ise` field. v2.0 build path adds an optional `ise` parameter
and a "set envelope_version='2.0' iff ise present" branch.

### FINDING-015 — TS `version.ts` lags one minor behind Python SDK
`reference-sdk/ts/src/version.ts:11` reads `ECL_VERSION_TARGET = "1.1"`.
Python SDK (`reference-sdk/py/src/eidolons_ecl/version.py:8-9`) reads
`__version__ = "1.2.0"`, `ECL_VERSION_TARGET = "1.2"`. **TS SDK was not
bumped to 1.2 in the v1.2.0/v1.2.1 releases** (latent gap distinct from
S2.3, but exposed by the v2 bump audit). Phase 2.C will need to bump
TS to `"2.0"`; the v1.2 catch-up should land alongside or as a
prerequisite.

### FINDING-016 — No Python envelope verifier ships in v1.2.1
`reference-sdk/py/src/eidolons_ecl/` contains no `envelope_verify.py`
(grepped: only `migrate/`, `a2a_bridge/`, `eval/`, `compose_gen/`,
plus `types.py`, `errors.py`, `version.py`). The Python `Envelope`
TypedDict at `reference-sdk/py/src/eidolons_ecl/types.py:139-171`
covers v1 shape. **Phase 2.C does not introduce a Py verifier** unless
SPECTRA decides to (GAP-B); ISE field exposure is via TypedDict update
at `types.py` and a regex bump in the docstring at `:147` (currently
`^1\\.0(\\.\\d+)?$`).

### FINDING-017 — Bash SDK `envelope-build.sh` hardcodes v1.0
`reference-sdk/bash/envelope-build.sh:191` (`--arg envelope_version
"1.0"`), `:203` (`schema_version "1.0"`), `:135` (`trust_level` defaulted
from contract). The bash emit path is the canonical reference and must
gain an `--ise` flag plus a v2.0 envelope_version override at Phase 2.C.

## Migration tooling (sub-question 5)

### FINDING-018 — `migrate/backfill.py` hardcodes `_ECL_ENVELOPE_VERSION = "1.0"`
`reference-sdk/py/src/eidolons_ecl/migrate/backfill.py:63`. The back-fill
tool emits **v1.0 envelopes by design** — it back-fills legacy artefacts
to the original baseline (v1.0). At v2.0 the question SPECTRA must
answer (GAP-C): does migrate continue emitting v1.0 (purely backward-
backfill) or shift to v2.0 (so newly-migrated artefacts are v2-shaped)?
The scoping doc lines 571-585 mention `migration-v1-to-v2.md` as a
NEW deliverable (`docs/migration-v1-to-v2.md`) — this is a different
artefact (the spec migration guide), not a change to the existing
back-fill tool.
- Sibling: `a2a_bridge/translator.py:205` reads `_ENVELOPE_VERSION` and
  emits `trust_level: "low"` at line 196 — also v1.0-shaped.

### FINDING-019 — `test_migrate.py` locks v1.0 in 4 assertions
`reference-sdk/py/tests/test_migrate.py:88` (fixture sets
`envelope_version: "1.0"`), `:200-210` (`test_envelope_version` asserts
`"1.0"`), `:217`, `:586` (referenced fields). These tests describe
back-fill's contract; they should NOT be flipped to v2.0 unless GAP-C
decides "migrate emits v2".

## Backward-compatibility window (sub-question 6)

### FINDING-020 — Three live surfaces must keep accepting v1.x post-v2.0
1. `conformance/lib/envelope.sh:38-40` E-3 regex must expand
   (after fix per FINDING-010).
2. `reference-sdk/ts/src/envelopeVerify.ts:135-170` ajv bundle must
   load **both** envelope.v1.json AND envelope.v2.json so v1.x envelopes
   continue validating.
3. `reference-sdk/py/src/eidolons_ecl/types.py:147` Envelope TypedDict
   regex docstring (also mirrored in handwritten code at runtime if
   adopted in any future Py verifier).
- Spec §7.3 (`spec/ecl-1.2.md:596-601`) anchors the contract.

## Conformance test fixtures (sub-question 7)

### FINDING-021 — Four bash fixtures lock v1.0 shape
`conformance/tests/fixtures/`: `conformant-handoff/`, `missing-integrity/`,
`over-budget-context/`, `undeclared-edge/`. Each contains a
`*.envelope.json` pinned at `envelope_version: "1.0"`
(`conformant-handoff/scout-report.envelope.json:2`). Phase 2.C adds
**v2 siblings**, NOT replacements — per scoping doc lines 199-210
("Old files remain in-tree per the §7.3 12-month compatibility window").
Suggested new fixtures: `conformant-ise-v2/`, `ise-missing-hierarchy/`,
`v1-envelope-on-v2-receiver/` (compat smoke).

### FINDING-022 — Three TS test suites lock v1 expectations
`reference-sdk/ts/src/envelopeBuild.test.ts`, `envelopeVerify.test.ts`,
`handoffEmit.test.ts` — all assert against `envelope_version: "1.0"`.
The I-5 test cluster at `envelopeVerify.test.ts:562-625` is the model
for the v2.0 ISE test cluster (force-write `ise` block on a built
envelope, then assert verifier behaviour).

### FINDING-023 — Six example envelopes lock v1.0
`examples/atlas-spectra-apivr-chain/{scout-report,spec,
apivr-completion-report}.md.envelope.json:2` and `examples/apivr-vigil-
escalation/{repair-failed-report,root-cause-report,ack}.md.envelope.json:2`.
The escalation example exercises `trust_level: "high"` (lines :31 each).
These should gain **v2 sibling examples** showing ISE-aware emit, NOT
replacements (`examples/.../run.sh:22` already references §6.4).

## Drift register (sub-question 8)

### FINDING-024 — DC-1 retires at v2.0.0 as `D-01` (promoted)
`docs/drift-register.md:170-191`. Promotion-trigger is exactly Phase 2.C
(line 184 names "Phase 2 S2.3 ISE trust-hierarchy fields"). Scoping doc
lines 235-257 prescribe the formal entry shape on promotion. The
historical block at `docs/drift-register.md:240-244` ("None yet")
gains its first entry.

### FINDING-025 — DC-2 and DC-3 do NOT retire alongside DC-1
- DC-2 (unused contract fields `schema_ref`, `required_sections`,
  `evidence_anchor_required`; `docs/drift-register.md:194-213`) — trigger
  is "first consumer that exercises them"; Phase 2.C is **envelope-only**
  (scoping line 210), no contract-side consumer here.
- DC-3 (TS↔bash `from`-field shape mismatch;
  `docs/drift-register.md:215-238`) — trigger "prior to v1.2.0 if not
  resolved" already PASSED (v1.2.1 shipped 2026-05-12). DC-3 is now
  **overdue**; it remains a candidate at v1.2.1. Phase 2.C inherits the
  obligation: a v2.0 PR that touches `envelopeVerify.ts` is the natural
  place to land the DC-3 fix (the `describe.skip`'d tests). SPECTRA may
  bundle DC-3 closure into S2.3 if scope allows; out of strict S2.3
  scope, it is a recommended companion fix (GAP-D).

## Per-Eidolon downstream blast (sub-question 9)

### FINDING-026 — Six Eidolons require post-v2.0 follow-up cycles
Per `.spectra/` adoption stubs in the NEXUS (not in eidolons-ecl):
`apivr-ecl-adoption.{md,yaml}`, `forge-ecl-adoption.{md,yaml}`,
`idg-ecl-adoption.{md,yaml}`, `spectra-ecl-adoption.{md,yaml}`,
`vigil-ecl-adoption.{md,yaml}`, plus ATLAS (which already ships its
own `.eidolons/atlas/schemas/` ECL vendor copy at v1.0.0 per the
nexus-side adoption convention).

Each needs:
- `vendor refresh` of the bumped schemas (mirror the new `$id`).
- `ECL_VERSION` bump `1.2 → 2.0` in the per-Eidolon repo's top-level file.
- Optional: opt-in to emitting `ise` on outbound envelopes.

This is **explicitly out of this PR's scope** per mission constraints
(stay inside `eidolons-ecl/`). Listed for SPECTRA's downstream-cycle
planning.

## Cross-cutting / contextual

### FINDING-027 — `.github/workflows/conformance.yml:43-50` SPEC.md check
Pins `spec/ecl-1.2.md`. Will need a tri-target at v2.0:
`SPEC.md` → `spec/ecl-2.0.md`; the `ECL_VERSION matches latest spec`
check (line 49-50) auto-resolves if `ECL_VERSION` bumps to `2.0` and a
`spec/ecl-2.0.md` file exists.

### FINDING-028 — `.github/workflows/release.yml:51-53` release-asset list
Hardcodes `spec/ecl-1.0.md`, `spec/ecl-1.1.md`, `spec/ecl-1.2.md`. Phase
2.C adds `spec/ecl-2.0.md` to this list; the prior three remain (§7.3).

### FINDING-029 — `.github/workflows/self-check.yml` is gated `if: false`
`self-check.yml:35`. Six per-Eidolon repos enumerated at lines 43-45+
(cross-org self-check stub). Phase 2.C does **not** activate this
workflow; it is downstream-Eidolon adoption work.

### FINDING-030 — `schemas/README.md` is scoped to "ECL v1.0"
`schemas/README.md:3`. Documents seven files only; missing the
`handoff-event.v1.json` row (latent doc drift). Phase 2.C: add a
v2 row block and fix the missing row.

