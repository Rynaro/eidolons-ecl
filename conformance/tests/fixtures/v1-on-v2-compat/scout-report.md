---
eidolon: atlas
version: 1.4.2
kind: scout-report
status: ready-for-spectra
created_at: "2026-05-13T10:02:00Z"
thread_id: "01942c7f-3c4d-7e04-9c5d-4fg3daE5g9c4"
decision_target: "ECL v1.2 envelope compatibility under v2.0 verifier"
scope:
  entrypoints: ["spec/ecl-1.2.md"]
  modules: ["spec/ecl-1.2.md"]
  excluded: []
findings_count: 1
gaps_count: 0
confidence_distribution:
  H: 1
  M: 0
  L: 0
evidence_anchors_count: 1
---

# Scout Report — v1.2 compat under v2.0 verifier

## Decision target
ECL §7.3 compat window: v1.x envelopes accepted under v2.0 verifier.

## Findings

- FINDING-001 — `spec/ecl-2.0.md:§7.3` defines 12-month compat window for v1.x. (H)

## Scope
Bounded to §7.3 compatibility gate.
