# Changelog

All notable changes to ECL (Eidolons Communication Layer) are documented in
this file. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer 2.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Rynaro/eidolons-ecl/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Rynaro/eidolons-ecl/releases/tag/v1.0.0
