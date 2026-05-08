---
eidolon: vigil
version: 1.0.3
kind: root-cause-report
status: completed
created_at: "2026-05-07T16:45:00Z"
reproduction_runs: 12
reproduction_ci: 0.94
hypotheses_count: 4
interventions_count: 3
blame_target: "cli/src/sync.sh:88"
verified_patch_path: ".eidolons/.vigil-sandbox/sync.sh.patch"
non_determinism_declared: true
---

# VIGIL Root-Cause Report — flaky roster fetch retry

## Reproduction
12 runs in sandbox; flake reproduced in 4/12 (CI 0.94 against null).
Flake binds to a single root cause; non-determinism declared.

## Hypotheses

1. Network jitter (rejected — flake reproduces with offline mock).
2. `git fetch` retry loop reads stale `$GIT_TERMINAL_PROMPT` (rejected
   — env clean across runs).
3. `cli/src/sync.sh:88` swallows `git fetch` exit code via `||`
   alongside an `if` that drops the err signal. Subsequent retry
   reads stale shallow clone state. (CONFIRMED — counterfactual flip)
4. Test fixture `roster-fetch.bats:fixtures/01` mutates global state
   (rejected — fixture is read-only).

## Interventions (3 of 5 budget)

1. Replace `||` with explicit exit-code capture; flake gone in 12/12 follow-up runs.
2. Confirmed counterfactual: revert the fix → flake returns at expected rate.
3. Verify under macOS bash 3.2; clean.

## Blame target
`cli/src/sync.sh:88` — the `||` fallthrough that masks `git fetch`
exit codes during retry, causing the next retry attempt to operate on
stale shallow-clone state.

## Verified patch
`.eidolons/.vigil-sandbox/sync.sh.patch` — 3-line change at the blame
target. APIVR-Δ may apply (sandbox authority).
