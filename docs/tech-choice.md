# Tech choice — ECL harness v1.1+

**Status:** committed (Phase 0 of `harness-roadmap.md`).
**Date:** 2026-05-11.
**Decision-maker:** repository maintainer.
**Frame prepared by:** Claude (per `harness-roadmap.md` §"Phase 0 — Tech-choice pre-step").

This document fulfils `harness-roadmap.md` Phase 0 acceptance gates **G0-1**
through **G0-5**. Nothing in Phase 1 (v1.1) or Phase 2 (v2.0) begins until
this document is merged.

---

## Decision

The ECL harness adopts a **multi-language, multi-tier** strategy
(Option F from the rubric below):

| Tier | Language | Role | Distribution |
|---|---|---|---|
| **Spec + conformance** | bash 3.2 | Canonical reference SDK; `conformance/check.sh`; current at `reference-sdk/bash/` | `curl \| bash` (unchanged) |
| **SDK + host integrations** | TypeScript | Primary SDK; native fit for Claude Code, Cursor, VS Code; targets Phase 1 (v1.1) — story S1.1 | npm package and/or vendor-as-single-file |
| **Eval framework** | Python | MultiAgentBench/MARBLE-style milestone KPIs; targets Phase 2 (v2.0) — story S2.1 | pip package and/or vendor-as-single-file |

**Layout:** all three live as **subdirectories inside `eidolons-ecl`**
(D-PHASE0-1 resolved).

```
eidolons-ecl/
├── spec/                  # ECL spec (current)
├── schemas/               # JSON Schemas (current)
├── contracts/             # YAML hand-off contracts (current)
├── conformance/           # bash conformance checker (current)
└── reference-sdk/
    ├── bash/              # canonical SDK (current)
    ├── ts/                # SDK + host integrations (Phase 1)
    └── py/                # eval framework (Phase 2)
```

**Versioning:** all three SDKs lock-step with the spec (D-PHASE0-3
resolved). A `ECL_VERSION` of `1.1` means the spec is at v1.1.0 and every
SDK in `reference-sdk/` is at v1.1.x. Patch versions per SDK MAY differ
(bugfix in ts/ doesn't force a py/ patch tag), but minor versions move
together.

**Licensing:** Apache-2.0 across every new artefact (D-PHASE0-4 resolved
— consistent with current ECL + EIIS posture).

---

## Criteria + weights

The nine criteria from `harness-roadmap.md` are accepted unchanged. The
maintainer did not re-weight any criterion during Phase 0; if rebalancing
becomes necessary mid-Phase-1 the **reversal conditions** below specify
when to revisit.

| ID | Criterion | Weight | Why |
|---|---|---:|---|
| C1 | Bash 3.2 floor compatibility | 0.20 | The current SDK and conformance checker work on macOS system bash. Any tier-1 SDK must coexist (or replace) without forcing a heavier runtime. |
| C2 | Cross-host viability | 0.20 | Eidolons run inside Claude Code, Cursor, Codex, opencode. SDKs must be callable/embeddable from each. |
| C3 | Distribution simplicity | 0.15 | `curl \| bash` is the deliberate ethos (see EIIS `docs/architecture.md` — "Why not a package manager"). |
| C4 | Maintainer familiarity | 0.15 | Single-maintainer project; ramp cost is real. |
| C5 | Schema-validation library | 0.10 | JSON Schema 2020-12 support is a hard requirement. |
| C6 | Cryptographic library | 0.05 | HMAC-SHA-256 today; ed25519 / signatures in v2.0+. Stdlib availability is what matters. |
| C7 | Performance for envelope volume | 0.05 | Realistic ceiling: 10³ envelopes/thread/day. Most languages handle this trivially; matters at the eval tier. |
| C8 | AI-friendliness for future agent work | 0.05 | Common, well-documented languages help future LLM subagents work in the codebase. |
| C9 | Licensing & governance | 0.05 | All current work is Apache-2.0. No copyleft surface, no corporate-controlled stack. |

---

## Scoring

0–3 per criterion (0 = poor, 3 = excellent). C4 scores reflect the
maintainer's stated comfort; other scores are framing-time estimates
inherited from `harness-roadmap.md` §"Phase 0".

| Option | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | Weighted total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Bash only | 3 | 1 | 3 | 3 | 0 | 1 | 1 | 0 | 3 | **1.95** |
| B. TypeScript only | 0 | 3 | 1 | 2 | 3 | 3 | 2 | 3 | 3 | **2.05** |
| C. Python only | 0 | 1 | 1 | 2 | 3 | 3 | 3 | 3 | 3 | **1.80** |
| D. Go only | 0 | 1 | 3 | 2 | 2 | 3 | 3 | 2 | 3 | **1.90** |
| E. Rust only | 0 | 0 | 2 | 1 | 2 | 3 | 3 | 2 | 3 | **1.45** |
| **F. Multi (Bash + TS + Py)** | **3** | **3** | **2** | **2** | **3** | **3** | **3** | **3** | **3** | **🥇 2.65** |

C4 scoring rationale (maintainer's read):
- **Bash (3)** — existing fluency; the SDK and conformance checker are already maintained.
- **TS (2)** — comfortable; standard developer-ecosystem familiarity. Ramp cost on ECL-specific tooling (ajv config, type generation) is small.
- **Python (2)** — comfortable; eval framework is the right context (Phase 2, after Phase 1 SDKs land).
- **Go (2)** — comfortable but not preferred for a tool that needs heavy interop with JSON Schema + cross-host embedding.
- **Rust (1)** — steepest ramp for a single maintainer; over-engineered for the harness's actual scale (10³ envelopes/day).

C2 scoring matters most for Option F: the multi-tier choice lets each
language carry the criterion it's strongest on (TS for hosts, Py for eval,
bash for the canonical SDK).

---

## Why F wins

- **C2 (cross-host)** is covered by the TS tier — Claude Code, Cursor, VS Code, opencode, and Codex all have first-class JS/TS extension points.
- **C5 (schema validation)** is covered by ajv (TS) and python-jsonschema (Py); both are top-of-class for JSON Schema 2020-12.
- **C7 (eval performance)** is covered by Python (with `pandas` / `polars` for any large-scale trace analytics if needed in Phase 2).
- **C1 (bash floor)** is preserved because bash stays the canonical SDK; nothing about Phase 1+ removes it.
- **C8 (AI-friendly)** is high for both TS and Py — future APIVR-Δ / FORGE subagents work in both languages comfortably.

The weighted total (2.65) is +0.6 above the runner-up (B at 2.05). The gap
is large enough that minor re-weighting wouldn't flip the result.

---

## Why the others were rejected

- **A. Bash only — rejected.** Score 1.95. Caps the harness ambition: jq has no JSON Schema 2020-12 support, host-LLM integration is painful, and the eval-framework tier (Phase 2) would have to be re-built in another language anyway. Choosing A delays a forced choice rather than making one.
- **B. TS only — rejected.** Score 2.05. Strong for hosts but weaker for the eval framework — Python's `pandas`/`polars`/MultiAgentBench ecosystem outclasses TS for that work. Forcing eval into TS is doable but costs C7 + C8 in Phase 2.
- **C. Python only — rejected.** Score 1.80. Awkward in host environments (Claude Code / Cursor extension surface is JS/TS-native). Forces a bash↔Python bridge for host integration.
- **D. Go only — rejected.** Score 1.90. Single-binary distribution is great but C2 (cross-host embedding) is weak — Go binaries don't drop into a Claude Code / Cursor extension cleanly.
- **E. Rust only — rejected.** Score 1.45. Over-engineered for the harness's scale (10³ envelopes/day) and steepest ramp cost. Reconsider only if a future component (e.g., a high-throughput trace event store) actually demands it.

---

## Resolved Phase 0 `[DECISION]`s

| ID | Decision | Resolution |
|---|---|---|
| **D-PHASE0-1** | Repo strategy | **Subdirectories inside `eidolons-ecl`** (single source of truth; matches current `reference-sdk/bash/` layout). Revisit only if one tier outgrows the others. |
| **D-PHASE0-2** | Distribution | **bash:** `curl \| bash` (unchanged). **TS:** primary distribution is npm; SHOULD also publish a vendor-as-single-file build at each release tag for Eidolons that don't want an npm dependency. **Python:** primary distribution is pip; SHOULD also publish a vendor-as-single-file build. |
| **D-PHASE0-3** | Versioning | **Lock-step with the spec.** Minor versions move together; patch versions per SDK MAY differ. Each SDK declares its target spec via an `ECL_VERSION_TARGET = "1.1"` constant (or equivalent — language-natural form). |
| **D-PHASE0-4** | License | **Apache-2.0** across every new artefact. Consistent with current ECL + EIIS. |

---

## Reversal conditions

This decision MUST be revisited if any of the following holds:

- **R-F-1 — Cross-tier coordination tax dominates.** If keeping TS + Py + bash semantically in sync costs more than 25% of harness-development time across two consecutive minor releases, collapse to whichever single language is carrying the most weight.
- **R-F-2 — TS host distribution becomes painful.** If npm publishing or vendor-as-single-file builds for TS prove to be a chronic friction point (e.g., bundler churn breaks the vendor target across multiple Node minor versions), revisit either by switching the SDK tier to Go (single-binary) or by absorbing the SDK into the host extension that needs it most.
- **R-F-3 — Python eval framework requires capabilities outside the chosen Python stack.** If Phase 2's eval framework demands native libraries (e.g., for graph algorithms or large-scale trace analytics) that python-jsonschema + pandas can't cover, revisit by either deepening Python or moving the eval tier to TS.
- **R-F-4 — Capacity reality.** Per `harness-roadmap.md` R5, "multi-language doesn't mean multi-PR." If even sequencing (TS in v1.1, Py in v1.2) outpaces the single maintainer's capacity, defer the Python tier until v1.3+ or until a contributor lands. The decision to commit to F is not a commitment to ship both tiers in the same release.

A revisit triggers a brief amendment to this document — **not** a full
reopening of Phase 0. Update this file in place, note the date and the
triggering condition, and proceed.

---

## Phase 1 sequencing (informational)

This belongs to Phase 1 of `harness-roadmap.md`, but the maintainer
flagged that the multi-language commitment will sequence as:

1. **ECL v1.1 (Phase 1)** — TypeScript SDK at `reference-sdk/ts/`. API parity with the bash SDK: `envelopeBuild`, `envelopeVerify`, `handoffEmit`, `traceTail`. ajv-validated. Stories S1.1, S1.3 (threat model), S1.4 (HMAC promotion), S1.5 (drift register population).
2. **ECL v1.2 or v2.0 (Phase 2)** — Python eval framework at `reference-sdk/py/` (or `eval/` — call it during Phase 2 framing). MultiAgentBench-style milestone KPIs. Story S2.1.

Phase 1 begins with this document merged. The TypeScript SDK PR follows
on a separate branch.

---

## Phase 0 acceptance gates — closed

| Gate | Status |
|---|---|
| **G0-1** `docs/tech-choice.md` exists in `eidolons-ecl` main | open until this PR merges |
| **G0-2** All nine criteria listed with weights and scoring | ✓ |
| **G0-3** Chosen option named with rationale; rejected options named with reasoning | ✓ |
| **G0-4** Reversal conditions explicit | ✓ (R-F-1 through R-F-4) |
| **G0-5** Human commits and merges the doc | open until this PR merges |

When this PR merges, all five gates close and Phase 1 unblocks.

---

## Provenance

- Frame: `eidolons/.spectra/harness-roadmap.md` §"Phase 0 — Tech-choice pre-step" (authored 2026-05-08).
- Decision recorded after a structured Phase 0 walk-through on 2026-05-11.
- Companion documents that inform this choice:
  - `harness-roadmap.md` — full v1.1 / v2.0 / Phase 3 scope.
  - `eidolons-ecl/CHANGELOG.md` — v1.1 / v2.0 roadmap entries.
  - `eidolons-ecl/docs/relationship-to-eiis.md` — distribution-ethos context.
