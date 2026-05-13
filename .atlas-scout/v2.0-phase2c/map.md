# Structural map — eidolons-ecl @ v1.2.1 (slice for v2.0 / S2.3)

## Top-level
- `ECL_VERSION` (currently `1.2`)
- `SPEC.md` → `spec/ecl-1.2.md` (symlink)
- `CHANGELOG.md`
- `README.md`

## spec/
- `ecl-1.0.md` (archived, kept in tree §7.3)
- `ecl-1.1.md` (archived, kept in tree §7.3)
- `ecl-1.2.md` (current; `^1\.[012](\.\d+)?$` regex, §6 integrity)

## schemas/  (six core + six per-Eidolon, all `$id` pinned at v1.0.0)
- core: envelope.v1.json, performative.v1.json, context-delta.v1.json,
  handoff-contract.v1.json, handoff-event.v1.json
- per-eidolon/: _base-profile.v1.json, apivr-completion-report.v1.json,
  reasoning-report.v1.json, repair-failed-report.v1.json,
  root-cause-report.v1.json, scout-report.v1.json, spec.v1.json

## contracts/  (19 YAML records; `trust_level` declared per edge)
- 3 carry `trust_level: high` (`apivr-to-vigil`, `vigil-to-apivr`,
  `vigil-to-spectra`); 16 carry `standard`.

## conformance/
- `check.sh` (entry; v1.0 hardcodes at lines 25, 39, 131, 135)
- `lib/envelope.sh` (E-3 regex still `1.0|1.0.*` at lines 38-40)
- `lib/integrity.sh` (I-1..I-5; I-5 reads constraints.trust_level)
- `lib/handoff-graph.sh`, `lib/context-budget.sh`
- `tests/conformance.bats` + `tests/fixtures/{conformant-handoff,
  missing-integrity,over-budget-context,undeclared-edge}/`
- `README.md` (gate table claims `^1\.[012]` for E-3 — stale relative to code)

## reference-sdk/
- `bash/` — envelope-build.sh, envelope-verify.sh, handoff-emit.sh, trace-tail.sh
- `ts/src/` — envelopeBuild.ts, envelopeVerify.ts, types.ts, version.ts
  (`ECL_VERSION_TARGET = "1.1"`), plus *.test.ts siblings
- `py/src/eidolons_ecl/` — __init__.py, __main__.py, errors.py,
  types.py (Envelope TypedDict; comment "spec v1.2"), version.py
  (`ECL_VERSION_TARGET = "1.2"`, `__version__ = "1.2.0"`),
  eval/, compose_gen/, migrate/{__init__,backfill,heuristics}.py,
  a2a_bridge/{agent_card,translator}.py
- `py/tests/` — test_scaffold, test_eval_kpi, test_compose_gen,
  test_migrate, test_a2a_bridge, fixtures/

## examples/  (envelopes pinned `envelope_version: "1.0"`)
- atlas-spectra-apivr-chain/ (3 envelopes + 3 payloads + run.sh)
- apivr-vigil-escalation/ (3 envelopes; trust_level=high on 3)

## docs/
- drift-register.md (DC-1/DC-2/DC-3 candidates)
- threat-model.md, rationale.md, tech-choice.md,
  relationship-to-eiis.md, relationship-to-mcp-a2a.md,
  migration-from-prose.md
- (absent) `migration-v1-to-v2.md` — S2.3.b deliverable per scoping doc.

## .github/workflows/
- conformance.yml (pins `spec/ecl-1.2.md`)
- release.yml (asset list enumerates `spec/ecl-1.0.md`, 1.1, 1.2)
- self-check.yml (`if: false` gate; v1.x per-Eidolon tags listed)

## .spectra/  (governance — read-only here)
- phase2-scoping.md / .yaml — split decisions; ISE shape stub
- v1.1-spec-bump.md / .yaml — DECISION-S2 (defer $id bump); ACTION-1/-4
- ts-sdk-port.md / .yaml — informs DC-3 / GAP-2

## .idg/
- ts-sdk-phase1-chronicle.md, phase2a-chronicle.md (deferred items)

## templates/
- envelope-example.json (v1.0 shape; verbatim canonical)
- handoff-contract-template.yaml
