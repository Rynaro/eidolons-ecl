---
eidolon: atlas
version: 1.4.2
kind: scout-report
status: ready-for-spectra
created_at: "2026-05-07T12:34:56Z"
thread_id: "01926e3a-2c8a-7b04-b3a1-1cf0a7a6d5e1"
decision_target: "Where does the install.sh write to $HOME and which writes can race?"
scope:
  entrypoints: ["cli/install.sh"]
  modules: ["cli/install.sh", "cli/lib.sh"]
  excluded: []
findings_count: 3
gaps_count: 1
confidence_distribution:
  H: 2
  M: 1
  L: 0
evidence_anchors_count: 5
---

# Scout Report — install.sh $HOME race

## Decision target
Where does the install.sh write to $HOME and which writes can race?

## Findings

- FINDING-001 — `cli/install.sh:42` writes to `$HOME/.eidolons/cache/` without acquiring a lock. (H)
- FINDING-002 — `cli/install.sh:118` chmods the cache dir after write. (H)
- FINDING-003 — `cli/lib.sh:55` reads the same cache dir before the chmod completes. (M)

## Gaps
- GAP-001 — Behaviour under NFS-mounted $HOME unverified.

## Scope
Bounded to `cli/install.sh` and `cli/lib.sh`. No Eidolon repos affected.
