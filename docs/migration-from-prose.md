# Migration — `methodology/composition.md` prose → ECL contracts

This guide explains how the prose hand-off table in
`methodology/composition.md` of the nexus repo maps onto the
machine-readable YAML contracts in [`../contracts/`](../contracts/).

## Why migrate

The prose table was the source of truth for hand-off semantics. As of
ECL v1.0, the YAML contracts under `contracts/` become the source of
truth. The prose table will continue to exist (humans still want a
narrative table), but it MUST be regenerated from the YAML rather than
hand-edited.

The migration is a separate PR against the nexus repo, not part of
ECL v1.0 itself. This doc captures the mapping so that PR is straightforward.

## Mapping

The prose table has columns: From, To, Artifact, Contains. Each row maps
to one YAML contract.

### Column → field

| Prose column | YAML field |
|---|---|
| From | `from` |
| To | `to` |
| Artifact | `artifacts[*].kind` |
| Contains | `artifacts[*].required_sections[]` |
| (not in prose) | `edge_origin` — derived: `roster` if the edge appears in `roster/index.yaml`'s `handoffs.*` arrays; `composition` otherwise |
| (not in prose) | `performatives_allowed[]` — derived from per-edge convention; see table below |
| (not in prose) | `context_delta.token_budget_max` — derived from operational defaults |
| (not in prose) | `trust_level` — derived: `high` for escalation edges; `standard` otherwise |

### Performative mapping

Most edges in the prose table are de-facto `PROPOSE` (a sender offers a
deliverable; a receiver decides whether to act on it). Specific
exceptions:

| Edge in prose | Default `performatives_allowed` |
|---|---|
| ATLAS → SPECTRA / APIVR | `[PROPOSE, INFORM, REFUSE]` |
| SPECTRA → APIVR | `[PROPOSE, INFORM, REFUSE]` |
| APIVR → IDG | `[PROPOSE, INFORM]` |
| APIVR → VIGIL (escalation) | `[ESCALATE, REQUEST, ACKNOWLEDGE]` |
| Any → FORGE | `[REQUEST, CRITIQUE]` |
| FORGE → Any | `[PROPOSE, INFORM, CRITIQUE]` |
| Any → VIGIL (consultation) | `[REQUEST, CRITIQUE]` |
| VIGIL → APIVR (return) | `[PROPOSE, CRITIQUE, INFORM]` |
| VIGIL → SPECTRA (replan) | `[PROPOSE, INFORM, ESCALATE]` |
| VIGIL → IDG (chronicle) | `[PROPOSE, INFORM]` |

### Worked migration: ATLAS → SPECTRA row

Prose table row:

> | ATLAS | SPECTRA | `scout-report.md` + `findings.json` | Evidence-anchored findings, decision target, open gaps, recommended scope |

Becomes [`contracts/atlas-to-spectra.yaml`](../contracts/atlas-to-spectra.yaml):

```yaml
contract_version: "1.0"
from: atlas
to: spectra
edge_origin: roster
performatives_allowed:
  - PROPOSE
  - INFORM
  - REFUSE
artifacts:
  - kind: scout-report
    schema_ref: ../schemas/per-eidolon/scout-report.v1.json
    required_sections:
      - decision_target
      - findings
      - gaps
      - scope
    evidence_anchor_required: true
context_delta:
  token_budget_max: 4000
  required_handles:
    - mission.md
trust_level: standard
notes: >
  ATLAS hands off a finalised scout report for SPECTRA to consume during the
  SCOPE phase. Listed in roster: atlas.handoffs.downstream contains spectra.
  Source-of-truth row in methodology/composition.md ("ATLAS | SPECTRA |
  scout-report.md + findings.json").
```

The `notes:` field carries the human prose rationale. The structured
fields carry the machine semantics.

## Regenerating the prose

Once all rows are migrated, the nexus repo's
`methodology/composition.md` table can be regenerated from the YAML
contracts. A small generator script (target: `cli/src/regen-composition.sh`,
to be added in the integration PR) reads each `contracts/*.yaml`,
sorts by (`from`, `to`), and emits the Markdown table. The
`composition.md` file gets a new header line:

```markdown
<!-- This table is generated from eidolons-ecl/contracts/. Do not edit by hand. -->
```

## Reconciling [DISPUTED] VIGIL edges

`methodology/cortex/handoff-graph.md` flagged three edges as
[DISPUTED]: VIGIL → APIVR, VIGIL → SPECTRA, VIGIL → IDG. composition.md
described them; roster/index.yaml didn't list them under
`vigil.handoffs.downstream`.

Reconciliation: ECL contracts treat the `lateral` array as
edge-declaring. `vigil.handoffs.lateral` already contains
`[atlas, spectra, apivr, idg, forge]`, so all three disputed edges are
roster-declared via lateral. The disputed flag should be removed from
the cortex graph during the integration PR.

## Forward edges

For edges enumerated in `contracts/README.md` as deferred (lateral
consultations to/from FORGE for atlas/spectra/idg), follow the template
listed there. Each is a near-copy of the representative contracts
already shipped (`apivr-to-forge.yaml`, `forge-to-apivr.yaml`).

## v1.2.1 — Tooling: `eidolons-ecl migrate`

> **Scope note.** The sections above describe a *contract-level*
> migration (prose composition table → YAML contracts in
> `contracts/`). This subsection covers a different, complementary
> migration concern: back-filling *envelope sidecars* for legacy
> artefacts (`.spectra/*.md`, `.atlas-scout/*.md`, root-level `*.md`)
> that pre-date ECL adoption. Both migrations are one-time; neither
> blocks the other.

ECL v1.2.1 ships an `eidolons-ecl migrate` CLI sub-command backed by
`reference-sdk/py/src/eidolons_ecl/migrate/` (Story S2.2).

Invocation:

```bash
eidolons-ecl migrate --root <project-root> [--dry-run] [--report <out.md>]
```

### Inputs

- A project root directory. The tool scans:
  - `<root>/.spectra/` recursively
  - `<root>/.atlas-scout/` recursively
  - `<root>/*.md` (top-level only, non-recursive)
- Filename-pattern heuristics classify each candidate into a
  `(from_eidolon, artifact_kind)` pair. Patterns are tested in order;
  first match wins (`*scout-report*`, `*completion-report*`,
  `*repair-failed-report*`, `*root-cause-report*`,
  `*reasoning-report*`, `*reasoning-request*`, `*chronicle*`,
  `*spec*`). Files inside `.spectra/` that match no glob fall back to
  `(spectra, spec)`; files inside `.atlas-scout/` fall back to
  `(atlas, scout-report)`. Unmatched files are skipped with
  `status="skipped_unknown"`.

### Outputs

- For each classified artefact `path/to/file.md`, a conformant v1.0
  ECL envelope is written to
  `path/to/file.md.envelope.json` (sidecar). Defaults:
  `performative = INFORM`, `to.eidolon = "orchestrator"`,
  `trust_level = "standard"`, `edge_origin = "implicit"`,
  `integrity.method = "sha256"` over file bytes,
  `confidence = 0.5`, with an entry in `assumptions[]` recording the
  back-fill provenance.
- If `--report <out.md>` is supplied, a Markdown migration report is
  written summarising scanned / created / skipped (existing) /
  skipped (unknown) counts and per-file outcomes. The renderer is
  deterministic (no timestamps, no random values), so the report
  diffs cleanly on re-runs.

### Idempotence

A second run on the same tree produces `created_count == 0`. Pre-
existing `*.envelope.json` sidecars are never overwritten — the
entry is marked `status="skipped_existing"`. Pass `--dry-run` to
populate the report without touching the filesystem.

### Gates

Back-filled envelopes target ECL v1.0 (the lowest-common-denominator
shape) so they pass the full conformance gate set under v1.0, v1.1,
and v1.2 without modification. The `integrity.value` field is the
SHA-256 of the artefact bytes on disk, so the I-1 / I-2 integrity
gates resolve directly against the source file. Operators SHOULD run
`conformance/check.sh` against any tree they back-fill to confirm
the gate set passes.

Sources: `reference-sdk/py/src/eidolons_ecl/migrate/backfill.py`,
`reference-sdk/py/src/eidolons_ecl/migrate/heuristics.py`,
`reference-sdk/py/tests/test_migrate.py`, S2.2 spec session.
