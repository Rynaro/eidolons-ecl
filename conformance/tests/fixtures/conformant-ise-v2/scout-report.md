---
eidolon: atlas
version: 1.4.2
kind: scout-report
status: ready-for-spectra
created_at: "2026-05-13T10:00:00Z"
thread_id: "01942c7f-1a2b-7e04-9c5d-2df1b8c3e7a2"
decision_target: "ECL v2.0 ISE trust-hierarchy integration scope"
scope:
  entrypoints: ["spec/ecl-2.0.md"]
  modules: ["spec/ecl-2.0.md", "schemas/envelope.v2.json"]
  excluded: []
findings_count: 2
gaps_count: 0
confidence_distribution:
  H: 2
  M: 0
  L: 0
evidence_anchors_count: 3
---

# Scout Report — ECL v2.0 ISE integration

## Decision target
ECL v2.0 ISE trust-hierarchy integration scope.

## Findings

- FINDING-001 — `spec/ecl-2.0.md:§6.5` introduces ISE block as OPTIONAL. (H)
- FINDING-002 — `schemas/envelope.v2.json` adds `ise` property with `$defs/ise`. (H)

## Scope
Bounded to ECL v2.0 spec and schema layer.
