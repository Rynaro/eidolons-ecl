# Contributing to ECL

ECL (Eidolons Communication Layer) is a small standards repo. Contributions
fall into four categories; the bar and process differ for each.

## 1. Spec changes (`spec/ecl-X.Y.md`)

These are normative. They affect every Eidolon and the nexus.

- **Open an issue first** describing the intent and the SemVer impact.
- A change that adds a field, an OPTIONAL clause, or a SHOULD is **additive**
  and goes in the next minor (`v1.x+1`). Create a new file
  `spec/ecl-1.x+1.md` rather than editing the previous one.
- A change that removes a field, tightens a SHOULD into a MUST, or breaks
  v1 conformance is a **major** (`v2.0`) and requires a migration guide in
  `docs/migrate-v1-to-v2.md`.
- All normative changes MUST be reflected in the JSON Schemas.

## 2. Schema changes (`schemas/*.json`)

- Schemas are JSON Schema **2020-12**. Run `jq empty schemas/*.json` locally.
- A schema bump that adds a field with a default or marks an existing field
  as `additionalProperties: true` is additive (`v1.x+1`). A schema bump that
  removes or tightens a field is a major (`v2.0`).
- Per-Eidolon profile schemas under `schemas/per-eidolon/` MUST be a strict
  subset of the central artifact-kind schema.

## 3. Conformance changes (`conformance/`)

- Bash 3.2 only — no `declare -A`, no `${var,,}`, no `readarray`/`mapfile`,
  no `&>>`. macOS ships bash 3.2 as the system shell.
- Run `shellcheck -x -S error conformance/check.sh conformance/lib/*.sh`.
- Add a `bats` fixture under `conformance/tests/fixtures/` for every new
  failure mode. Tests in `conformance/tests/conformance.bats` MUST stay
  green.
- Exit codes are normative — see §6 of the spec.

## 4. Hand-off contracts (`contracts/*.yaml`)

- One file per directed edge: `contracts/<from>→<to>.yaml`.
- Edges MUST exist in `roster/index.yaml` of the nexus repo OR be explicitly
  marked `edge_origin: composition` (covered in `methodology/composition.md`)
  or `edge_origin: implicit` (with rationale).
- Run `yq eval '.' contracts/*.yaml` locally before pushing.

## Pull requests

- One concept per PR.
- Title: `<area>: <imperative description>`. Examples:
  - `spec(envelope): clarify thread_id uuid v7 vs v4`
  - `conformance: add fixture for refused-handoff exit-2`
  - `contracts(vigil): add VIGIL→IDG systemic-notes edge`
- Body: link the issue; if no issue, justify why none was needed.
- CI MUST be green before review.

## Releasing

- `ECL_VERSION` MUST match the `MAJOR.MINOR` of `spec/ecl-X.Y.md`.
- Tag `vX.Y.Z` triggers `.github/workflows/release.yml` which bundles
  `conformance/` as a tarball and attaches it plus the spec to the
  GitHub Release.
- Update `CHANGELOG.md` `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD` before
  tagging.

## License

By contributing you agree your contribution is licensed under Apache-2.0.
