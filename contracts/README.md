# Hand-off contracts

One YAML record per directed edge in the Eidolons hand-off graph. These
records collectively replace the prose hand-off table in
`methodology/composition.md`.

The schema is defined by [`../schemas/handoff-contract.v1.json`](../schemas/handoff-contract.v1.json)
and ECL v1.0 §3.

## Edges enumerated in v1.0

These are the load-bearing edges exercised by the worked examples and the
canonical pipeline:

| File | From | To | Edge origin | Primary artefact |
|---|---|---|---|---|
| `atlas-to-spectra.yaml` | atlas | spectra | roster | scout-report |
| `atlas-to-apivr.yaml` | atlas | apivr | roster | scout-report |
| `spectra-to-apivr.yaml` | spectra | apivr | roster | spec |
| `apivr-to-idg.yaml` | apivr | idg | roster | apivr-completion-report |
| `apivr-to-vigil.yaml` | apivr | vigil | roster | repair-failed-report |
| `vigil-to-apivr.yaml` | vigil | apivr | roster | root-cause-report |
| `vigil-to-spectra.yaml` | vigil | spectra | roster | root-cause-report |
| `vigil-to-idg.yaml` | vigil | idg | roster | root-cause-report |
| `apivr-to-forge.yaml` | apivr | forge | roster | reasoning-request |
| `forge-to-apivr.yaml` | forge | apivr | roster | reasoning-report |

## Edges enumerated in v1.0.1

Lateral consultation edges between FORGE and every other Eidolon —
unblocks the FORGE adoption in the Eidolons nexus by enumerating each
edge separately rather than relying on the apivr-to-forge / forge-to-apivr
representative shapes. Body shape mirrors the templates noted below; the
bespoke `notes:` field on each file documents the edge-specific
consultation trigger.

| File | From | To | Edge origin | Template |
|---|---|---|---|---|
| `atlas-to-forge.yaml`    | atlas    | forge | roster | apivr-to-forge.yaml |
| `spectra-to-forge.yaml`  | spectra  | forge | roster | apivr-to-forge.yaml |
| `idg-to-forge.yaml`      | idg      | forge | roster | apivr-to-forge.yaml |
| `vigil-to-forge.yaml`    | vigil    | forge | roster | apivr-to-forge.yaml |
| `forge-to-atlas.yaml`    | forge    | atlas | roster | forge-to-apivr.yaml |
| `forge-to-spectra.yaml`  | forge    | spectra | roster | forge-to-apivr.yaml |
| `forge-to-idg.yaml`      | forge    | idg | roster | forge-to-apivr.yaml |
| `forge-to-vigil.yaml`    | forge    | vigil | roster | forge-to-apivr.yaml |

## Edges deferred to later v1.0.x patch releases

Edges declared in `roster/index.yaml` but not yet exercised; emission on
these edges fails conformance until a contract lands.

| Pending file | From | To | Template |
|---|---|---|---|
| `atlas-to-vigil.yaml`    | atlas    | vigil | apivr-to-vigil.yaml (failure-description kind, not escalation) |
| `spectra-to-vigil.yaml`  | spectra  | vigil | apivr-to-vigil.yaml |
| `idg-to-vigil.yaml`      | idg      | vigil | apivr-to-vigil.yaml |

A consumer that needs one of these edges before its dedicated contract
lands MAY copy the named template, change `from`/`to`, and submit a PR.
The conformance checker will refuse envelopes on edges without contracts;
this is deliberate and forces deliberate enumeration.

## Filename convention

`<from>-to-<to>.yaml`. ASCII only — earlier drafts used the U+2192 right
arrow (`→`), but several conformance toolchains (`yq`, `jq`, `bash`)
mishandle non-ASCII filenames in CI. The contract body itself MAY use the
arrow in `notes:` for readability.

## Adding a new contract

1. Copy the closest existing contract.
2. Set `from`, `to`, and the `edge_origin`.
   - `roster` if the edge appears in `roster/index.yaml`'s
     `handoffs.{upstream, downstream, lateral}` arrays.
   - `composition` if the edge is described in
     `methodology/composition.md` but not yet in roster.
   - `implicit` for edges discovered through real usage but not yet in
     either source. MUST include a `notes:` field justifying.
3. Validate: `yq eval '.' contracts/<file>.yaml`.
4. Add a fixture under `conformance/tests/fixtures/` exercising at least
   one valid envelope on this edge.
