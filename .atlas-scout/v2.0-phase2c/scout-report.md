# Scout report — ECL v2.0.0 Phase 2.C (S2.3 ISE) surface inventory

**From:** ATLAS v1.5.1 → **To:** SPECTRA. **Performative:** INFORM.
**Repo:** `/Users/henrique/workspace/oss/agents/eidolons-ecl` @ `main` @ v1.2.1.
**Scope:** decision-ready inventory of every surface that must change to ship
v2.0.0; closes DC-1; OPT-IN ISE fields per scoping doc §S2.3.
**Out of scope:** ISE field design (SPECTRA-owned); per-Eidolon repos.

## Headline

Phase 2.C is **envelope-only** (`.spectra/phase2-scoping.md:210`). The
behavioural change is small but radial: one new schema file
(`schemas/envelope.v2.json`), spec text additions (§6.5 + §1.1.1 regex +
§7.3), a coordinated `$id` bump from `/v1.0.0/` → `/v2.0.0/` across **all
12 schema files** (closes DC-1), and matched updates in three SDK tiers
plus CI workflows. v1.x receivers and emitters remain conformant for ≥12
months per §7.3. **Latent drift:** the bash E-3 gate is **already** stale
relative to v1.1/v1.2 README claims (FINDING-010) — Phase 2.C is the
natural place to fix.

## Surface inventory (cite-anchored)

### 1. Spec text (`spec/ecl-2.0.md` NEW; archives ecl-{1.0,1.1,1.2}.md retained)
- §1.1.1 regex: `^1\.[012](\.\d+)?$` → `^[12]\.\d+(\.\d+)?$`
  (`spec/ecl-1.2.md:96-98`; scoping doc:520).
- §6.3 trust-level table (`spec/ecl-1.2.md:481-500`) UNCHANGED in prose.
- NEW §6.5 ISE subsection (scoping doc:522-541).
- §7.3 paragraph: "v2.0 receivers SHALL accept v1.x envelopes through
  2027-MM-DD" (`spec/ecl-1.2.md:596-601`).
- §7.1 footnote: $id bumped per D-01 (scoping doc:538).

### 2. Schemas (all 12 `$id`s bump; only envelope adds fields)
**$id segment `/v1.0.0/` → `/v2.0.0/`** in:
- `schemas/envelope.v1.json:3`, `performative.v1.json:3`,
  `context-delta.v1.json:3`, `handoff-contract.v1.json:3`,
  `handoff-event.v1.json:3`, `per-eidolon/_base-profile.v1.json:3`,
  and six per-eidolon profiles
  (`apivr-completion-report`, `reasoning-report`, `repair-failed-report`,
  `root-cause-report`, `scout-report`, `spec`).v1.json:3.
- **NEW file:** `schemas/envelope.v2.json` with `$defs.ise` and an
  updated `envelope_version` pattern. Old `envelope.v1.json` retained.
- Filename convention: `*.v1.json` AND `*.v2.json` co-exist (scoping:197-208).
- **Breakage radius:** ajv resolves by `$id`; external vendors pinning
  URIs must update. `reference-sdk/ts/src/envelopeVerify.ts:163-170,184-190`
  is the canonical resolver — adding `envelope.v2.json` to the loader
  (lines 112-119) is the load-bearing TS change.

### 3. Contracts (`contracts/*.yaml`)
- All 19 edges already declare `trust_level` (16 standard, 3 high).
- **No contract carries ISE today.** `grep ise contracts/` is empty.
- Phase 2.C scope is envelope-only — contract shape **not bumped** unless
  SPECTRA decides per-edge ISE defaults (see GAP-A).

### 4. Conformance — bash (`conformance/`)
- `conformance/lib/envelope.sh:38-40` — E-3 currently `1.0|1.0.*` ONLY
  (stale; rejects v1.1/v1.2 envelopes despite README claims). Phase 2.C
  fixes AND expands to v2.0.
- `conformance/check.sh:25,39,131,134-141` — five v1.0 hardcodes.
- `conformance/lib/integrity.sh:112-124` — I-5 site reading
  `constraints.trust_level`. Likely **promotion SHOULD→MUST** at v2.0 per
  `.spectra/v1.1-spec-bump.md:88` [ACTION-1].
- `conformance/README.md:67,77` — gate table prose update.
- New gates if ISE has receive-side MUST: natural namespace `S-*`
  (SPECTRA-assigned).

### 5. Conformance — fixtures
`conformance/tests/fixtures/{conformant-handoff,missing-integrity,
over-budget-context,undeclared-edge}/` — all lock `envelope_version:
"1.0"`. Add v2 siblings; do NOT replace (§7.3 compat). Suggested:
`conformant-ise-v2/`, `ise-missing-hierarchy/`, `v1-on-v2-compat/`.

### 6. Reference SDKs (envelope-emit + verify paths)
- **Bash** `reference-sdk/bash/envelope-build.sh:135,191,203` hardcoded
  `"1.0"`; add `--ise` flag + v2.0 default.
- **TS** `reference-sdk/ts/src/version.ts:11` — **latent gap: still
  `"1.1"`**, never bumped to v1.2. Phase 2.C must jump TS to `"2.0"`.
- **TS** `envelopeBuild.ts:208,219` — `envelope_version "1.0"`,
  `schema_version "1.0"`. Add v2 emit branch.
- **TS** `envelopeVerify.ts:112-119,136-170,736-762` — schema bundle
  loader (add `envelope.v2.json`) + `deriveEGate` (handle new ISE
  pattern errors).
- **TS** tests: `envelopeBuild.test.ts`, `envelopeVerify.test.ts`,
  `handoffEmit.test.ts`. I-5 cluster at `envelopeVerify.test.ts:562-625`
  is the template for v2 ISE tests.
- **Py** `version.py:8-9` → `2.0.0`/`"2.0"`. `types.py:147` regex
  docstring. `types.py:139-171` add `IseBlock` TypedDict + optional
  `ise` field.
- **Py** **no envelope verifier exists in v1.2.1** (FINDING-016).
  GAP-B: introduce one, or stay TS+bash only.

### 7. Migration tooling (existing back-fill is v1.0-shaped by design)
- `reference-sdk/py/src/eidolons_ecl/migrate/backfill.py:63`
  `_ECL_ENVELOPE_VERSION = "1.0"` — back-fill is **legacy-shape by
  intent**. GAP-C: keep at v1.0 or shift to v2 for newly-migrated files.
- `reference-sdk/py/tests/test_migrate.py:88,200-210,217,586` —
  v1.0 assertions. Do not flip unless GAP-C says yes.
- `reference-sdk/py/src/eidolons_ecl/a2a_bridge/translator.py:196,205`
  — sibling site (`_ENVELOPE_VERSION`, `trust_level: "low"`).
- **NEW deliverable:** `docs/migration-v1-to-v2.md` (scoping doc:571-585).

### 8. Examples
`examples/atlas-spectra-apivr-chain/*.md.envelope.json:2` and
`examples/apivr-vigil-escalation/*.md.envelope.json:2` — six envelopes
pinned `"1.0"`. Add v2 siblings showcasing ISE; keep v1 for §7.3
compat smoke tests.

### 9. Drift register (`docs/drift-register.md`)
- DC-1 (lines 170-191) → `D-01` **promoted**, status retired. Historical
  block at lines 240-244 gets first entry per scoping doc:236-257.
- DC-2 (lines 194-213) — UNTOUCHED at v2.0 (envelope-only).
- DC-3 (lines 215-238) — **overdue**; trigger said pre-v1.2.0 but
  v1.2.1 shipped without resolution. Phase 2.C is natural piggyback
  (GAP-D). Two `describe.skip`'d tests in `envelopeVerify.test.ts`
  remain blocked.

### 10. CI workflows
- `.github/workflows/conformance.yml:43-50` — SPEC.md symlink check.
- `.github/workflows/release.yml:51-53` — asset list (`spec/ecl-1.0.md`,
  `1.1.md`, `1.2.md`). Add `spec/ecl-2.0.md`.
- `.github/workflows/self-check.yml:35` is `if: false`; downstream
  per-Eidolon activation, not Phase 2.C work.

### 11. Top-level + templates
- `ECL_VERSION` (`1.2` → `2.0`).
- `SPEC.md` symlink → `spec/ecl-2.0.md`.
- `schemas/README.md:1-21` — currently scoped to "ECL v1.0"; expand to
  enumerate v2 row(s); also fix latent doc drift (missing
  `handoff-event.v1.json` row).
- `templates/envelope-example.json` — v1.0 worked example. GAP-F: add
  `templates/envelope-v2-example.json` sibling?
- `CHANGELOG.md` — new `[2.0.0]` section; trailing pointer at line 98-99
  ("Phase 2.C (final, v2.0.0): S2.3...") fulfilled.

### 12. Per-Eidolon downstream blast (out of this PR; planning only)
Six Eidolons require post-v2.0 follow-up `vendor refresh + ECL_VERSION
bump 1.2 → 2.0` cycles: **APIVR-Δ**, **ATLAS**, **FORGE**, **IDG**,
**SPECTRA**, **VIGIL**. Each carries its own `.eidolons/<name>/schemas/`
vendor copy in the consumer project layout; the nexus already has
adoption stubs at `eidolons/.spectra/{apivr,forge,idg,spectra,vigil}-ecl-
adoption.{md,yaml}` (ATLAS pre-shipped at v1.0.0).

## Findings index

`FINDING-001` through `FINDING-030` — see
`.atlas-scout/v2.0-phase2c/findings.md` for full evidence + `path:line`
citations. Categories: spec (001-005), schemas (006-007), contracts
(008-009), bash conformance (010-012), TS SDK (013-015), Py SDK (016),
bash SDK (017), migration (018-019), backcompat (020), fixtures (021-023),
drift (024-025), per-Eidolon (026), workflows + docs (027-030).

## Hand-off to SPECTRA — unknowns to close

- **[GAP-A]** Contract schema bump? Currently envelope-only; SPECTRA
  may want a per-edge `default_ise` declaration.
- **[GAP-B]** Phase 2.C introduces Python envelope verifier, or
  TS+bash only? (`reference-sdk/py/src/eidolons_ecl/` has none today.)
- **[GAP-C]** `migrate/backfill.py` + `a2a_bridge/translator.py` —
  stay v1.0-shape or shift to v2 for new emits?
- **[GAP-D]** DC-3 (TS↔bash `from`-field shape drift) — bundle into
  S2.3 PR or defer? Already overdue.
- **[GAP-E]** Concrete ISE field set and SHALL-level receiver semantics
  (mission-constrained: SPECTRA-owned). Scoping doc:216-228 has a
  proposal but is non-binding.
- **[GAP-F]** Ship `templates/envelope-v2-example.json` at Phase 2.C?
- **[GAP-G]** Latent: bump TS `ECL_VERSION_TARGET` `"1.1"` → `"2.0"`
  directly, or land an intermediate `"1.2"` fix as a prerequisite?
- **[GAP-H]** Promote I-5 SHOULD → MUST as part of v2.0 (per
  `.spectra/v1.1-spec-bump.md:88` [ACTION-1]) or stay SHOULD?
- **[GAP-NEXUS]** Nexus `harness-roadmap.md` referenced by
  `docs/drift-register.md:185` and `.spectra/phase2-scoping.md:4` was
  not present in the nexus checkout at scout time
  (`/Users/henrique/workspace/oss/agents/eidolons/.spectra/`). SPECTRA
  should confirm the canonical source.

## Constraints honoured

- Read-only: no edits made to any code, schema, spec, or test.
- No ISE field-shape proposal emitted.
- Per-Eidolon repos not entered.
- Every claim cites `path:line` (full evidence in `findings.md`).

— END —
