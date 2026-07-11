# Changelog

All notable changes to ECL (Eidolons Communication Layer) are documented in
this file. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer 2.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`edge_origin: emitted-request`** — the `edge_origin` vocabulary
  (`spec/ecl-2.1.md` §3.3, `schemas/handoff-contract.v1.json`,
  `schemas/envelope.v2.json`, `schemas/envelope.v2.1.json`, and the Python
  SDK's `EdgeOrigin` `Literal`) is extended additively with a fourth value:
  a typed request artifact PROPOSEd upward by the sender for the
  orchestrator to route, distinguishing worker-emitted delegation from
  roster-declared dispatch (the sender's own roster entry keeps
  `downstream: []`). Backward compatible — the three original values
  (`roster` | `composition` | `implicit`) are unchanged and every existing
  contract still validates as before. ECL owns this field, so ECL
  accommodates the new semantic in a versioned revision rather than a
  downstream spec working around it. `reference-sdk/py/tests/
  test_contract_schema.py` locks in strict-validation coverage.
- **Gilgamesh contract edges** (ESL change `generalist-eidolon`, Track F) —
  eight directed-edge contracts for Gilgamesh, the bounded-authority,
  specialist-preferring fallthrough generalist (nexus roster status
  `in_construction`): two inbound (`human→gilgamesh` implicit,
  `orchestrator→gilgamesh` roster — the corpus's first `orchestrator-to-*`
  contract), five outbound PROPOSE-upward hand-off requests
  (`gilgamesh→{atlas,kupo,vigil,idg,forge}`, `edge_origin: emitted-request`
  per R-050/AC-F05, reconciling `handoffs.downstream: []`), and one lateral
  reply (`forge→gilgamesh`, mirroring `forge-to-apivr.yaml`). Two new
  per-Eidolon profiles: `schemas/per-eidolon/mission-contract.v1.json`,
  `schemas/per-eidolon/handoff-request.v1.json`. All eight contracts now
  validate strictly against `handoff-contract.v1.json`.

## [2.1.1] — 2026-07-06 — RAMZA succession contract edges + composition reseat

### Added

- **RAMZA planner-seat contract edges** — nine directed-edge contracts for
  RAMZA, the mechanized-gate planner that takes the default planner seat from
  SPECTRA (Vivi-pattern succession; SPECTRA retained as the conservative opt-in
  fallback): `atlas→ramza`, `ramza→vivi`, `ramza→apivr`, `ramza→forge`,
  `ramza→kupo`, `forge→ramza`, `human→ramza`, `kupo→ramza`, `vigil→ramza`. They
  mirror the SPECTRA edge set (same artifact kinds — `scout-report` inbound,
  `spec` outbound), with the default downstream coder now Vivi. All validate
  against `schemas/handoff-contract.v1.json`.

### Changed

- **`composition.md.j2` template reseat** — the canonical-pipeline diagram, the
  numbered walkthrough, the labeled-handoff and consultation examples, and the
  partial-team configurations now read `ATLAS → RAMZA → Vivi → IDG` (the current
  default seats), replacing the stale `SPECTRA → APIVR-Δ` pipeline. Regenerating
  `methodology/composition.md` from this template + the v2.1.1 contracts surfaces
  the RAMZA and Vivi edges together (the latter previously deferred since v2.0.2).

## [2.1.0] — 2026-07-03 — ISE promotions + verification seam (Published)

> Cut to Published: the adoption gate was met eight-fold (all eight shipped
> Eidolons emit ISE as of the Wave-3 releases). `ECL_VERSION` → 2.1;
> `SPEC.md` → `spec/ecl-2.1.md`; checker `VERSION` → 2.1.0. Content below is
> unchanged from the 2026-07-02 draft.

**Status: Draft (adoption-gated). NOT a release.** `ECL_VERSION` stays `2.0`,
`SPEC.md` continues to resolve to `spec/ecl-2.0.md`, and the conformance
checker's own `--version` stays `2.0.0`. 2.0 remains the **governing Published
spec**. 2.1 is cut to Published — at which point `ECL_VERSION` and `SPEC.md`
flip to 2.1 — only once **≥ 3 of the shipped Eidolons emit the ISE block** (the
§6.5.5 / §6.2.6 promotion precondition recorded in 2.0). The checker already
recognises `envelope_version: "2.1"` and applies the v2.1 gates to any envelope
that declares it, so emitters MAY adopt 2.1 ahead of the cut. All changes below
are **scoped by `envelope_version`**: v2.0 and v1.x envelopes verify
byte-identically to before.

### Added

- **`spec/ecl-2.1.md`** — ECL v2.1 spec (Draft). Carries `spec/ecl-2.0.md`
  forward with three deltas:
  1. Gates **I-5** (`hmac-sha256` at `trust_level=high`, §6.2.6) and **S-3**
     (`ise` block at `trust_level=high`, §6.5.5) **promoted SHOULD → MUST**,
     realising the two `[PROMOTION-CANDIDATE]` clauses recorded in 2.0. The
     promotion is scoped strictly to `envelope_version: "2.1"` envelopes.
  2. New OPTIONAL **`ise.verification`** sub-block (§6.5.8): `{ fresh_context:
     boolean, checker: <eidolon-slug>, transcript_access: none|artifact-only }`.
     When present its shape is MUST (new gate **S-4**). ECL 2.1 only
     shape-checks it; the MUST-level pairing of `assertion_grade: "validated"`
     with a fresh-context, different-`checker` verification is owned by **ESL
     (C8)**, not ECL — the division of labour is documented explicitly in
     §6.5.8.3 (mirroring the ECL/EIIS boundary in §8).
  3. `envelope_version` acceptance widened to `^(1\.[012]|2\.[01])(\.\d+)?$`
     (§1.1.1).
- **`schemas/envelope.v2.1.json`** — copy of `envelope.v2.json` plus the
  `ise.verification` sub-block (`fresh_context` boolean, `checker` slug pattern
  `^[a-z][a-z0-9-]*$`, `transcript_access` enum `none|artifact-only`, all three
  required when the sub-block is present, `additionalProperties: false`) and the
  widened `envelope_version` pattern. `envelope.v2.json` is left untouched.
- **`conformance/lib/ise.sh`** — S-3 made version-aware (SHOULD/WARN at ≤v2.0,
  MUST/FAIL at v2.1); new **S-4** `ise_verification_shape` gate (MUST, v2.1
  only — no-op for ≤v2.0 envelopes so their output stays byte-identical).
- **`conformance/lib/integrity.sh`** — I-5 made version-aware: MUST/FAIL on
  `trust_level=high` + `sha256` for v2.1 envelopes; unchanged SHOULD/WARN
  (byte-identical reason string) for ≤v2.0.
- **`conformance/lib/envelope.sh`** — E-3 `envelope_version` case accepts
  `2.1|2.1.*`.
- **`conformance/check.sh`** — added an explicit `2.1|2.1.*` target-version
  case (documentation only; gates are driven per-envelope by `envelope_version`,
  so no `--target-version` change is required to exercise 2.1 envelopes).
- **Conformance fixtures** (v2.1): `conformant-ise-v2.1/`,
  `conformant-high-trust-v2.1/` (hmac; the bats test skips if `openssl` is
  absent), `ise-verification-invalid-v2.1/` (S-4 fail),
  `high-trust-no-ise-v2.1/` (S-3 + I-5 MUST fail); plus a v2.0 regression
  fixture `high-trust-sha256-v2/` proving a v2.0 high-trust `sha256` envelope
  still only WARNS (exit 4). **13 new bats tests** (37 total, all green).
- `conformance/README.md`, `schemas/README.md` — gate table, version-aware
  notes, and the new fixtures documented.

### Notes

- **Byte-identical back-compat.** The v2.1 gate promotions and S-4 are gated on
  `envelope_version` matching `^2\.1(\.\d+)?$`. All pre-existing v2.0 / v1.x
  fixtures and their bats assertions are unchanged (24/24 prior tests still
  green). The I-5 SHOULD-level warn reason string was preserved verbatim for
  ≤v2.0 envelopes.
- **No new performatives.** The closed ten-performative set is unchanged. See
  the 2.0.3 erratum below for the §6.5.3 `COMMIT`/`REJECT` correction that this
  draft also carries.
- **Reference SDKs (TS/Py) not yet updated for 2.1.** Deferred while 2.1 is
  Draft; the bash checker is the canonical conformance surface. The TS/Py
  verifiers continue to target v2.0 and are unaffected (they neither emit nor
  reject `envelope_version: "2.1"` per this draft's additive contract).

## [2.0.3] — 2026-07-02 — Erratum: §6.5.3 ghost performatives

### Fixed

- **`spec/ecl-2.0.md` §6.5.3 erratum.** The v2.0 emitter-rule clause referenced
  a "mutating-performative edge (`COMMIT`, `REJECT`)". `COMMIT` and `REJECT` are
  **not** members of the closed ten-performative set (§2.1: REQUEST, INFORM,
  PROPOSE, CRITIQUE, DECIDE, DELEGATE, ACKNOWLEDGE, ESCALATE, RESUME, REFUSE).
  Corrected in place to the closed-set mutation-carrying performatives
  `PROPOSE`/`DECIDE` (`PROPOSE` offers a change/spec/plan/edit-proposal for the
  receiver to act on; `DECIDE` records the routing/approval that authorises a
  mutation), with a one-line "Erratum 2026-07-02" note beside the clause. No
  performative was added or removed; smallest-possible touch. The same
  correction is carried into `spec/ecl-2.1.md` with a fuller footnote (§6.5.3).

## [2.0.2] - 2026-06-10

### Added

- **Vivi succession edges (10 contracts) + vivi-completion-report profile.**
  Closes the deferred `vivi↔kupo` item noted in the Kupo executor batch
  (v2.0.1). Vivi (loop-native default coder, A→P→I→V→Δ/R cycle, `Rynaro/Vivi`
  v1.1.2) succeeds APIVR-Δ as the default coder seat in the nexus roster.
  - **Inbound (6):** `atlas-to-vivi.yaml` (scout-report), `spectra-to-vivi.yaml`
    (spec), `forge-to-vivi.yaml` (reasoning-report), `vigil-to-vivi.yaml`
    (root-cause-report), `human-to-vivi.yaml` (prompt), `kupo-to-vivi.yaml`
    (edit-proposal). Each mirrors the corresponding `*-to-apivr` contract with
    `to: vivi` and Vivi-specific notes.
  - **Outbound (4):** `vivi-to-idg.yaml` (vivi-completion-report),
    `vivi-to-forge.yaml` (reasoning-request), `vivi-to-vigil.yaml`
    (repair-failed-report), `vivi-to-kupo.yaml` (vivi-completion-report,
    delegation context). Each mirrors the corresponding `apivr-to-*` contract
    with `from: vivi` and Vivi-specific notes.
  - **New profiles:**
    - `schemas/per-eidolon/vivi-completion-report.v1.json` — emitted at
      Implement/Verify exit; pins `eidolon: vivi`, `kind: vivi-completion-report`;
      allOf-extends `_base-profile`; adds `loop_iterations` (V-phase closed-loop
      count) and `tracks_count` (TRANCE G4 parallel tracks, default 1).
    - `schemas/per-eidolon/vivi-repair-failed-report.v1.json` — emitted on the
      3-failure threshold (I-5: Bounded recovery); pins `eidolon: vivi`,
      `kind: repair-failed-report` (shared kind, emitter distinguished by
      envelope `from.eidolon`); same body shape as `repair-failed-report.v1.json`
      (which pins `eidolon: apivr`); adds `loop_iterations_used`.
  - All 10 validate against `schemas/handoff-contract.v1.json`.
  - `contracts/README.md` updated with the new "Vivi succession edges (v2.0.2)"
    section enumerating inbound and outbound tables.
  - `schemas/per-eidolon/README.md` updated with the two new profiles.

## [2.0.1] - 2026-06-09

### Added

- **Kupo executor edges (11 contracts) + the `edit-proposal` profile.** Per-edge contracts for Kupo (the low-effort `executor` Eidolon, shipped in the nexus roster at v1.0.0): inbound `DELEGATE` from `spectra/vigil/forge/apivr/atlas` + `human` `REQUEST`; outbound `kupo→spectra/vigil/forge/apivr` (`PROPOSE` a verified `edit-proposal`) + `kupo→atlas` (`INFORM`/`ESCALATE` only — no PROPOSE to a read-only scout). New per-Eidolon profile `schemas/per-eidolon/edit-proposal.v1.json` (allOf-extends `_base-profile`; pins `eidolon: kupo`, `kind: edit-proposal`; requires a green `verifier_result`). All 11 validate against `handoff-contract.v1.json`.
- Six new contract files under `contracts/` enumerating every
  `human → <eidolon>` edge for the shipped roster:
  - `human-to-atlas.yaml`, `human-to-spectra.yaml`, `human-to-apivr.yaml`,
    `human-to-idg.yaml`, `human-to-forge.yaml`, `human-to-vigil.yaml`.
  - Allowed human-origin performatives: `REQUEST`, `INFORM`,
    `CRITIQUE`, `REFUSE`, `ACKNOWLEDGE`, `ESCALATE`.
  - Forbidden (enforced by absence from `performatives_allowed`):
    `PROPOSE`, `DECIDE`, `DELEGATE`, `RESUME`. Per-performative
    rationale is recorded in each contract's `notes:` field and in
    Junction spec §5.7 (`human-to-atlas.yaml` carries the canonical
    rationale; the other five reference it).
  - `artifacts[0].kind: prompt`, `schema_ref:
    ../schemas/per-eidolon/_base-profile.v1.json` — the base profile
    is reused as the body shape; consumers may extend with a
    `prompt.v1.json` profile in a later additive PR if needed.
- `contracts/README.md` — new "Human-origin edges (additive)" section
  enumerates the six files alongside the existing v1.0 / v1.0.1
  tables.

## [2.0.0] — 2026-05-13 — Phase 2.C: ISE trust-hierarchy, v2.0 MAJOR

### Added

- **`spec/ecl-2.0.md`** — ECL v2.0 spec. MAJOR bump introducing the ISE
  (Intent, Source, Entitlement) trust-hierarchy block (§6.5) with three
  new optional fields: `ise.assertion_grade` (required when `ise` present),
  `ise.provenance`, and `ise.receiver_authorization`. New conformance gates
  S-1 (MUST), S-2 (MUST), S-3 (SHOULD). Updated §7.3 compatibility window:
  v2.0 receivers SHALL accept v1.x envelopes through 2027-05-13.
- **`schemas/envelope.v2.json`** — New schema for v2.x envelopes with `ise`
  `$defs/ise` block and widened `envelope_version` pattern to `1.[012]|2.0`.
- **`conformance/lib/ise.sh`** — New bash 3.2 compatible library implementing
  S-1, S-2, S-3 gates. Sourced by `conformance/check.sh`.
- **ISE types in TS SDK** (`reference-sdk/ts/src/types.ts`): `IseBlock`,
  `IseProvenance`, `IseReceiverAuthorization`, `AssertionGrade`.
- **ISE types in Py SDK** (`reference-sdk/py/src/eidolons_ecl/types.py`):
  `IseBlock`, `IseProvenance`, `IseReceiverAuthorization`, `AssertionGrade`.
- **`--ise JSON`** flag added to `reference-sdk/bash/envelope-build.sh`.
- **`envelopeBuild`** (TS): new `ise?` option; envelope includes ISE block
  when provided.
- **`envelopeVerify`** (TS): loads both `envelope.v1.json` and
  `envelope.v2.json`; dispatches by `envelope_version` (v1.x → v1 schema,
  v2.x → v2 schema); adds S-3 warning (`trust_level=high` + `ise` absent);
  `deriveEGate` maps `/ise` path errors to `S-1`.
- **Conformance fixtures** (v2.0): `conformant-ise-v2/`, `ise-missing-hierarchy/`,
  `v1-on-v2-compat/` under `conformance/tests/fixtures/`. 7 new bats tests.
- **v2 example envelopes**: `examples/*/\*.v2.envelope.json` (two sibling envelopes).
- **`templates/envelope-v2-example.json`** — canonical v2.0 envelope template.
- **`docs/migration-v1-to-v2.md`** — migration guide for v1.x → v2.0 upgrade.
- **`docs/drift-register.md`**: file D-02 (ISE contract defaults deferred),
  D-04 (Py verifier deferred); retire DC-1 → D-01, DC-3 → D-03.

### Changed

- `schemas/*.json` (all 12 files): `$id` URI path segment `/v1.0.0/` →
  `/v2.0.0/`. Resolves drift candidate DC-1 (D-01 retired). See
  `docs/migration-v1-to-v2.md` for import-path update guidance.
- `schemas/README.md`: enumerates the new `envelope.v2.json` row under a v2.0
  schema section; adds the previously-missing `handoff-event.v1.json` row to
  the v1.x table (FINDING-030); documents the `$id` segment bump
  (`/v1.0.0/` → `/v2.0.0/`) and clarifies that `*.v1.json` filenames are
  unchanged — the versioned identifier is the `$id` URI path, not the file
  name.
- `conformance/check.sh`: version `1.0.0` → `2.0.0`; default target version
  `1.0` → `2.0`; added `v2.0`/`2.x` target cases; sources `lib/ise.sh`.
- `conformance/lib/envelope.sh`: E-3 regex now accepts
  `1.0|1.1|1.2|2.0` (fixes latent P1 bug — v1.1/v1.2 envelopes were
  rejected by old `1.0` only pattern); adds E-3.compat INFO gate.
- `conformance/README.md`: updated gate table; added S-* prefix; added v2.0
  fixture list; updated E-3 description.
- `reference-sdk/ts/src/version.ts`: `ECL_VERSION_TARGET` `"1.1"` → `"2.0"`
  (DECISION-S7/S10 — TS SDK jumped from 1.1 directly to 2.0).
- `reference-sdk/ts/src/envelopeBuild.ts`: default `envelope_version` and
  `artifact.schema_version` now `"2.0"` (were `"1.0"`).
- `reference-sdk/py/src/eidolons_ecl/version.py`: `__version__` `"1.2.0"` →
  `"2.0.0"`, `ECL_VERSION_TARGET` `"1.2"` → `"2.0"`.
- `reference-sdk/bash/envelope-build.sh`: default `envelope_version` and
  `artifact.schema_version` now `"2.0"` (were `"1.0"`).
- `ECL_VERSION`: `1.2` → `2.0`.
- `SPEC.md` symlink: re-targeted from `spec/ecl-1.2.md` to `spec/ecl-2.0.md`.
- `.github/workflows/release.yml`: added `spec/ecl-2.0.md` to release assets.
- `.github/workflows/conformance.yml`: updated SPEC.md symlink check to v2.0.

### Fixed

- **E-3 latent P1 bug** — `conformance/lib/envelope.sh` previously only
  accepted `envelope_version: "1.0"`, silently rejecting v1.1 and v1.2
  envelopes. Fixed: now accepts `1.0`, `1.1`, `1.2`, and `2.0`.
- **DC-3 closure** — Two `describe.skip`'d shell-out integration tests in
  `envelopeVerify.test.ts` un-skipped (DECISION-S5). The bash checker
  already reads `.from.eidolon` correctly; the skip was based on a stale
  description. Added `hasBashAndJq()` guard for stripped environments.

### Deferred

- **Py SDK `envelope_verify`**: `reference-sdk/py` does not yet ship an
  `envelope_verify` equivalent. Use `conformance/check.sh` or the TS SDK
  verifier for Py-side workflows. Tracked as D-04; planned additive in v2.1.
  FORGE confirmed defer (DECISION-S3).
- **ISE contract defaults (`default_ise`)**: `handoff-contract.v1.json` does
  not include a `default_ise` field. No live contract carries one; adding it
  would expand the schema-bump radius to 19 contract files. Tracked as D-02.
- **`migrate/backfill.py` and `a2a_bridge/translator.py`** still emit v1.0
  envelopes (DECISION-S4 — intentional; these tools are migration utilities
  and their output format is not changing as part of this PR).
- **I-5 promotion** (`hmac-sha256` MUST at `trust_level=high`) — stays
  SHOULD-level WARN at v2.0 per DECISION-S8; PROMOTION-CANDIDATE to MUST at
  v2.1 once HMAC-adoption telemetry from the per-Eidolon vendoring cycle
  shows ≥3 of 6 Eidolons routinely emitting `hmac-sha256` at high.

## [1.2.1] — 2026-05-12 — Phase 2.B: migration tool + A2A bridge

### Added
- `reference-sdk/py/src/eidolons_ecl/migrate/` — back-fill v1.0 ECL
  envelopes for legacy Markdown artefacts (Story S2.2). Scans
  `.spectra/` and `.atlas-scout/` recursively plus top-level `*.md`
  under the caller-supplied root; classifies each file via filename-
  pattern heuristics (`*scout-report*`, `*completion-report*`,
  `*repair-failed-report*`, `*root-cause-report*`, `*reasoning-report*`,
  `*reasoning-request*`, `*chronicle*`, `*spec*`) with `.spectra/`
  and `.atlas-scout/` directory-membership fallbacks; writes a
  conformant v1.0 envelope sidecar at `<artefact>.envelope.json`
  alongside each classified file. Idempotent — pre-existing sidecars
  are never overwritten (`skipped_existing`); unrecognised files are
  left untouched (`skipped_unknown`). Emitted envelopes set
  `performative = INFORM`, `to.eidolon = "orchestrator"`,
  `trust_level = "standard"`, `edge_origin = "implicit"`,
  `integrity.method = "sha256"` over the file bytes, and carry an
  assumption noting the back-fill provenance. Invocable via
  `eidolons-ecl migrate --root <dir> [--dry-run] [--report <path>]`;
  the optional `--report` path receives a deterministic Markdown
  summary (`render_markdown(MigrationReport)`).
- `reference-sdk/py/src/eidolons_ecl/a2a_bridge/` — one-way A2A → ECL
  adapter (Story S2.4). `emit_agent_card(roster_path)` parses
  `roster/index.yaml` (or any roster-shaped YAML) and returns an A2A
  Agent Card dict with `schemaVersion = "1.0"`, top-level
  `version = "1.2"` (tracks the ECL SDK target), `organization`,
  `name`, and a `members[]` list derived from `eidolons[*]` (each
  member carries `name`, `description`, `capability_class`,
  `methodology_cycle`, `lateral_consultants[]`, and a
  downstream-derived `skills[]` array). `translate_a2a_message(msg,
  target_eidolon=..., target_version=...)` converts an inbound A2A
  Message dict to a conformant ECL v1.0 envelope: role→performative
  mapping `user → REQUEST`, `agent → PROPOSE`, unknown → `REQUEST`
  with an assumption entry; `from.eidolon = "a2a-external"`,
  `trust_level = "low"`, `edge_origin = "implicit"`,
  `artifact.kind = "a2a-message"`, `artifact.path` is the sentinel
  `"a2a-message.txt"`, and the raw text is carried as the vendor
  extension field `x_inline_content` (`x_*` per ECL §1.2.3 —
  receivers SHALL ignore). Invocable via
  `eidolons-ecl a2a-card --roster <path> [--out <path>]` and
  `eidolons-ecl a2a-translate --message <path> --to <slug> [--out <path>]`.
- `reference-sdk/py/tests/test_a2a_bridge.py` — 26 unit tests plus an
  integration test (`test_integration_conformance_round_trip`) that
  translates a synthetic A2A Message, persists the inline content to
  the sentinel `a2a-message.txt`, provisions a synthetic
  `contracts/a2a-external-to-atlas.yaml` edge in a tmp dir, and runs
  the bash `conformance/check.sh` end-to-end (exit 0 expected).
- `reference-sdk/py/tests/test_migrate.py` — 39 unit tests covering
  the heuristic match table, envelope field shape, idempotence on
  re-runs, the `skipped_existing` and `skipped_unknown` paths, and a
  guarded integration test against the live nexus checkout.

### Changed
- `eidolons-ecl` CLI — the `migrate`, `a2a-card`, and `a2a-translate`
  sub-commands shipped as stubs in v1.2.0 are now real entry points
  wired to the modules above (see
  `reference-sdk/py/src/eidolons_ecl/__main__.py`).
- `reference-sdk/py/Dockerfile.dev` — image now installs
  `jq + git + bash + coreutils` so the A2A bridge integration test
  can shell out to `conformance/check.sh` from inside the dev
  container.
- `ruff` and `mypy --strict` pass cleanly across the new
  `migrate/` and `a2a_bridge/` modules.

### Notes
- **Backward compatible** — v1.0, v1.1, and v1.2 envelopes all remain
  valid; no spec text changed in this release. `SPEC.md` still
  points at `spec/ecl-1.2.md` and `ECL_VERSION` stays at `1.2`
  (the version file declares `MAJOR.MINOR`, not patch).
- The A2A bridge is **one-way** (inbound A2A Message → ECL
  envelope). Reverse translation (ECL → A2A) is Phase 3 work and is
  intentionally out of scope here.
- The vendor-extension field `x_inline_content` carries the raw
  inbound message text. Receivers SHALL ignore `x_*` per ECL §1.2.3;
  callers SHOULD persist that content to the sentinel path
  `a2a-message.txt` (relative to the envelope file's directory)
  before downstream emit, so the bash conformance checker can
  resolve the artifact when verifying SHA-256.
- External edges (`from.eidolon = "a2a-external"`) are intentionally
  **NOT** enumerated in the repo's `contracts/` set — operators
  declare them per deployment for any Eidolon they expose
  externally. The integration test provisions a synthetic
  `a2a-external-to-atlas.yaml` contract in a tmp dir to prove
  structural correctness without committing an open-world edge to
  the canonical contract set.
- PyPI publishing for the Python SDK remains deferred (account-setup
  blocker); distribution is via the zipapp bundle
  (`dist/eidolons-ecl-sdk.bundle.pyz`) and source checkout.
- **Phase 2.C (final, v2.0.0):** S2.3 ISE-style trust hierarchy
  fields (schema $id bump trigger; closes drift candidate DC-1).

[1.2.1]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v1.2.1

## [1.2.0] — 2026-05-12 — Phase 2.A: Python tier + eval framework + composition generator

### Added
- `reference-sdk/py/` — Python reference SDK tier per `docs/tech-choice.md`
  Phase 0 multi-language commitment. Containerised dev (Docker
  `python:3.12-slim` + hatch + uv + pytest + ruff + mypy strict).
- `reference-sdk/py/src/eidolons_ecl/eval/` — evaluation framework
  computing four KPI families over `.eidolons/.trace/*.jsonl` files
  (Story S2.1):
  - Coordination quality (decisions/refuse/escalate rates → good/warn/poor)
  - Topology efficacy (chain / star / graph / degenerate classifier)
  - Competition resilience (CRITIQUE fraction → low/moderate/strong)
  - Plan-execution divergence (SPECTRA→APIVR ratio → aligned/divergent/n/a)
- `reference-sdk/py/src/eidolons_ecl/compose_gen/` — generator that
  regenerates `methodology/composition.md` from `contracts/*.yaml`
  via a Jinja2 template. Deterministic output for fixed input set
  (Story S2.5).
- `spec/ecl-1.2.md` — successor to `spec/ecl-1.1.md`. v1.0 and v1.1
  envelopes remain conformant under v1.2 (§1.1.1 regex relaxed to
  `^1\.[012](\.\d+)?$`). v1.0 and v1.1 archives stay in-tree per §7.3.
- `eidolons-ecl` CLI: `eval`, `compose-gen` subcommands implemented.
  `migrate`, `a2a-card`, `a2a-translate` remain stubs (Phase 2.B).
- Vendor distribution: `python -m zipapp` builds
  `dist/eidolons-ecl-sdk.bundle.pyz` (29 KB) alongside the wheel.

### Changed
- `ECL_VERSION` file: `1.1` → `1.2`.
- `SPEC.md` symlink: `spec/ecl-1.1.md` → `spec/ecl-1.2.md`.
- `.github/workflows/release.yml` — release asset list includes
  `spec/ecl-1.2.md` (plus v1.1 and v1.0 archives).
- `.github/workflows/conformance.yml` — SPEC.md symlink check updated
  to expect `spec/ecl-1.2.md`.
- `conformance/README.md` — E-3 regex documentation updated to reflect
  the v1.2 expansion.
- README.md — "Latest stable" pointer + Reference SDK tier list now
  enumerates bash + TypeScript + Python.

### Notes
- **Backward compatible** — v1.0, v1.1, v1.2 envelopes all valid under
  v1.2 conformance. No schema $id bumps (per SPECTRA decision D-P2-2:
  schema $ids stay at v1.0.0 until first additive schema field lands
  in v2.0 / Phase 2.C).
- **Cross-repo follow-up (deferred):** `Rynaro/eidolons` will gain a
  `.github/workflows/composition-drift.yml` workflow + a regenerated
  `methodology/composition.md` once v1.2.0 is tagged + released, so
  the workflow can pin to the released `.pyz` SHA. This lands as a
  separate PR against the nexus.
- **Phase 2.B (next, v1.2.1):** S2.2 migration tool + S2.4 A2A bridge.
- **Phase 2.C (final, v2.0.0):** S2.3 ISE-style trust hierarchy fields
  (schema $id bump trigger; closes drift candidate DC-1).

[1.2.0]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v1.2.0

## [1.1.0] — 2026-05-12 — HMAC promotion + threat model + drift register seed

### Added
- `spec/ecl-1.1.md` — successor to `spec/ecl-1.0.md`. v1.0 archive remains
  in-tree per the §7.3 12-month compatibility window.
- New normative §6.2.6 — SHOULD-level conformance warn when
  `trust_level=high` AND `integrity.method=sha256`.
- New normative §6.4 — HMAC key lifecycle (provisioning, scope, lifetime,
  storage, rotation, verification failure).
- New conformance gate **I-5** (SHOULD) in `conformance/lib/integrity.sh`
  and `reference-sdk/ts/` mirror — warn when `trust_level=high` AND
  `integrity.method=sha256`. Non-blocking; backward-compatible.
- `docs/threat-model.md` — five threats (AiTM, prompt infection,
  inter-agent trust exploitation, context poisoning, indirect prompt
  injection) mapped to ECL envelope-level mitigations with §-anchors and
  gate IDs. Cites ACL 2025, arXiv:2410.07283, OWASP LLM01:2025.
- `docs/drift-register.md` — formal entry schema + governance process
  (Adding / warn-only window / promotion / retirement). v1.1.0 ships with
  zero open drifts and three drift candidates (DC-1 schema $id versioning
  lag, DC-2 unused contract fields, DC-3 envelopeVerify shell-out
  C-1 parse mismatch).
- `spec/ecl-1.1.md` §7.4 — replaces the v1.0 stub with a pointer to
  `docs/drift-register.md` as the authoritative register.

### Changed
- **§6.1** — `hmac-sha256` row promoted from "OPTIONAL; RECOMMENDED for
  trust_level=high" to "**RECOMMENDED** at trust_level=high; OPTIONAL
  otherwise". `sha256` row notes the I-5 SHOULD-level warn at
  `trust_level=high`.
- **§1.1.1** — `envelope_version` regex relaxed to `^1\.[01](\.\d+)?$`
  so v1.0 envelopes remain conformant under v1.1.
- **§1.2.2** — aligned prose with the new I-5 gate; pointers to §6.3
  and §6.4 added.
- **§6.3** — new §6.3.3 SHOULD pointer to §6.4 (key lifecycle).
- `ECL_VERSION` file: `1.0` → `1.1`.
- `SPEC.md` symlink: `spec/ecl-1.0.md` → `spec/ecl-1.1.md`.
- `.github/workflows/release.yml` — release asset list now includes both
  `spec/ecl-1.1.md` and `spec/ecl-1.0.md` (v1.0 stays attached for
  archival access).
- `.github/workflows/conformance.yml` — SPEC.md symlink check updated
  to expect `spec/ecl-1.1.md`.
- `conformance/README.md` — gate table gains I-5 row; E-3 updated to
  reflect the relaxed `envelope_version` regex.
- `reference-sdk/ts/` SDK `1.1.0 → 1.1.1`; `ECL_VERSION_TARGET` `"1.0"`
  → `"1.1"`; `envelopeVerify` emits I-5 in `result.warnings[]`.
- 3 new vitest cases under `envelopeVerify.test.ts` covering I-5 paths
  (warn on high+sha256, no-warn on high+hmac-sha256, no-warn on
  standard+sha256).

### Notes
- **Backward compatible** — v1.0 envelopes valid under v1.1.
- **No schema $id bumps** — schemas stay at `v1.0.0` $ids (DECISION-S2
  in `.spectra/v1.1-spec-bump.md`; tracked as drift candidate DC-1).
- **No new envelope-format changes** — promotion is prose + gate only.
- Per-Eidolon `ECL_VERSION` bumps to `1.1` are out of scope for this PR;
  each adoption spec under `eidolons/.spectra/{eidolon}-ecl-adoption.md`
  carries the per-Eidolon change set.

### Drift register
None open at v1.1.0. See `docs/drift-register.md` for candidates
(DC-1 / DC-2 / DC-3) flagged for future review.

[1.1.0]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v1.1.0

## [1.0.1] — 2026-05-11 — FORGE lateral contracts enumerated

### Added
- Eight new contract files under `contracts/` enumerating every FORGE
  lateral edge as roster-derived contracts:
  - `atlas-to-forge.yaml`, `spectra-to-forge.yaml`, `idg-to-forge.yaml`,
    `vigil-to-forge.yaml` — consultation requests to FORGE. Body mirrors
    `apivr-to-forge.yaml` (kind `reasoning-request`, base profile).
  - `forge-to-atlas.yaml`, `forge-to-spectra.yaml`, `forge-to-idg.yaml`,
    `forge-to-vigil.yaml` — reasoning reports back from FORGE. Body
    mirrors `forge-to-apivr.yaml` (kind `reasoning-report`,
    `reasoning-report.v1.json` profile).
- `notes:` field on each contract documents the edge-specific consultation
  trigger (e.g. ATLAS calls FORGE on competing call-graph framings;
  SPECTRA on noise-floor ties in the scoring rubric; VIGIL on
  dependency-graph hypotheses with comparable counterfactual support;
  IDG on `[DISPUTED]`-marker reconciliation).

### Changed
- `contracts/README.md` — the eight FORGE edges move from "Edges deferred
  to v1.0.x patch releases" into a new "Edges enumerated in v1.0.1"
  table. The three remaining vigil-inbound deferred edges (`atlas-to-vigil`,
  `spectra-to-vigil`, `idg-to-vigil`) are relabelled as "later v1.0.x
  patch releases" and stay deferred.

### Notes
- Pure additive patch: no schema changes, no envelope-format changes, no
  changes to existing contracts. `ECL_VERSION` stays at `1.0`
  (the version file declares `MAJOR.MINOR`, not patch).
- Unblocks the FORGE adoption pass in the Eidolons nexus.
- All eight new contracts validate against `schemas/handoff-contract.v1.json`.

[1.0.1]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v1.0.1

## [1.0.0] — 2026-05-08

### Added
- §1 Envelope: canonical JSON message-envelope schema covering identity
  (`message_id`, `thread_id`, `parent_id`), addressing (`from`, `to`),
  intent (`performative`, `objective`), payload reference (`artifact`),
  context discipline (`context_delta`), constraints, expected response,
  confidence, integrity, and trace metadata.
- §2 Performatives: ten-verb enum
  (`REQUEST`, `INFORM`, `PROPOSE`, `CRITIQUE`, `DECIDE`, `DELEGATE`,
  `ACKNOWLEDGE`, `ESCALATE`, `RESUME`, `REFUSE`).
- §3 Hand-off contracts: machine-readable YAML records (one per directed
  edge in the Eidolons hand-off graph) replacing the prose table in
  `methodology/composition.md`.
- §4 Context-delta discipline: per-edge token budgets,
  input-handle references, ≤200-token summary.
- §5 Trace: JSONL audit-event format; one line per emit/receive/verify
  event; persisted to `.eidolons/.trace/<thread_id>.jsonl`.
- §6 Integrity: SHA-256 default; HMAC-SHA-256 OPTIONAL.
- §7 Versioning: SemVer at the document level; drift register seeded
  empty.
- `conformance/check.sh`: standalone bash 3.2 conformance checker.
- `reference-sdk/bash/`: four helper scripts (`envelope-build.sh`,
  `envelope-verify.sh`, `handoff-emit.sh`, `trace-tail.sh`).
- Worked examples: `examples/atlas-spectra-apivr-chain/` and
  `examples/apivr-vigil-escalation/`.

### Drift register
None at v1.0.0. Drifts will be enumerated as `D-1`, `D-2`, … as they are
discovered against live Eidolon emit behaviour during the warn-only window.

[Unreleased]: https://github.com/Rynaro/eidolons-ecl/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v2.0.0
[1.0.0]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v1.0.0
