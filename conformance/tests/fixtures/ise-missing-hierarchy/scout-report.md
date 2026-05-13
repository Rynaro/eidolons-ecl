---
eidolon: atlas
version: 1.4.2
kind: scout-report
status: ready-for-spectra
created_at: "2026-05-13T10:01:00Z"
thread_id: "01942c7f-2b3c-7e04-9c5d-3ef2c9d4f8b3"
decision_target: "ECL v2.0 ISE missing assertion_grade failure fixture"
scope:
  entrypoints: ["conformance/lib/ise.sh"]
  modules: ["conformance/lib/ise.sh"]
  excluded: []
findings_count: 1
gaps_count: 0
confidence_distribution:
  H: 1
  M: 0
  L: 0
evidence_anchors_count: 1
---

# Scout Report — ISE missing assertion_grade

## Decision target
Fixture to trigger S-1 failure (ise block present but assertion_grade absent).

## Findings

- FINDING-001 — `ise` block present without `assertion_grade` fails S-1 MUST gate. (H)

## Scope
Bounded to conformance/lib/ise.sh S-1 gate.
