# Changelog

All notable changes to ECL (Eidolons Communication Layer) are documented in
this file. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer 2.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
