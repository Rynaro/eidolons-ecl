# Changelog

All notable changes to ECL (Eidolons Communication Layer) are documented in
this file. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer 2.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
