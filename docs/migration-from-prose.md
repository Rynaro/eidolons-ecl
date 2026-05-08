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
