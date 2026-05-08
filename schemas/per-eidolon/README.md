# Per-Eidolon profile schemas

Profiles validate the **YAML frontmatter** of each artefact kind. They are
deliberately **structural** — they assert that the frontmatter object has
the right keys and types, not that the Markdown body is correct. The body's
detailed shape (required sections, evidence-anchor counts, etc.) is owned
by each Eidolon's own repository and validated by their own toolchain.

## Convention

- File: `<artifact-kind>.v1.json`
- Each profile `allOf`-extends `_base-profile.v1.json`.
- Each profile constrains `eidolon` and `kind` with `const`.

## Profiles in v1.0

| File | Emitter | Consumer(s) | Used by contracts |
|---|---|---|---|
| `scout-report.v1.json` | ATLAS | SPECTRA, APIVR-Δ | atlas→spectra, atlas→apivr |
| `spec.v1.json` | SPECTRA | APIVR-Δ | spectra→apivr |
| `apivr-completion-report.v1.json` | APIVR-Δ | IDG | apivr→idg |
| `repair-failed-report.v1.json` | APIVR-Δ | VIGIL | apivr→vigil |
| `root-cause-report.v1.json` | VIGIL | APIVR-Δ, SPECTRA, IDG | vigil→apivr, vigil→spectra, vigil→idg |
| `reasoning-report.v1.json` | FORGE | any | *→forge / forge→* |

## Adding a profile

1. Create `<kind>.v1.json` that `allOf`-extends `_base-profile.v1.json`.
2. Pin `eidolon` and `kind` with `const`.
3. Reference it from a contract via `artifacts[*].schema_ref`.
4. Add a fixture under `conformance/tests/fixtures/` exercising at least
   one valid and one invalid frontmatter shape.

## Strict-subset rule

Per-Eidolon repos MAY ship their own richer schemas in their own
`schemas/` directory; those schemas MUST be a strict subset of the
profile here. The conformance checker validates the profile; the
Eidolon's own toolchain validates the richer body.
