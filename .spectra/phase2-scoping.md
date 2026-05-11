# SPECTRA spec — Phase 2 scoping (ECL v1.2 + v2.0 split)

**Status:** Assemble (confidence 0.90, 1 Refine cycle)
**Roadmap parent:** `/Users/henrique/workspace/oss/agents/eidolons/.spectra/harness-roadmap.md` §"Phase 2 — ECL v2.0" (stories S2.1–S2.5)
**Phase 0 ground:** `/Users/henrique/workspace/oss/agents/eidolons-ecl/docs/tech-choice.md` (Option F, committed 2026-05-11)
**Phase 1.A precedent:** `/Users/henrique/workspace/oss/agents/eidolons-ecl/.spectra/ts-sdk-port.md`
**Phase 1.B precedent:** `/Users/henrique/workspace/oss/agents/eidolons-ecl/.spectra/v1.1-spec-bump.md`
**Drift register:** `/Users/henrique/workspace/oss/agents/eidolons-ecl/docs/drift-register.md` (DC-1 closed by S2.3)
**Target repos:** `Rynaro/eidolons-ecl` (primary) + `Rynaro/eidolons` (S2.5 generated artefact)
**Spec authored:** 2026-05-11

---

## CLARIFY

- **WHO** — Three agent classes across three sub-phases:
  - **Phase 2.A (S2.1, S2.5)** — APIVR-Δ subagents (`model: sonnet`, `isolation: worktree`). Greenfield Python tier + composition generator (Python lives in `reference-sdk/py/`; generator lives there too for tool-language co-location).
  - **Phase 2.B (S2.2, S2.4)** — APIVR-Δ subagents (`model: sonnet`, `isolation: worktree`). Migration tool + A2A bridge — both additive Python modules under `reference-sdk/py/`.
  - **Phase 2.C (S2.3)** — APIVR-Δ subagent + IDG subagent. The schema/spec edit is the only **v2.0-shaped** change in Phase 2; ships as its own PR + tag.
  - **Parent** runs validation gates, opens PRs, tags `v1.2.0` (Phase 2.A + 2.B) and `v2.0.0` (Phase 2.C) after merge.
- **WHAT** — Land Phase 2 of the harness roadmap **as three sub-phases across two minor lines + one major line**:
  - **v1.2.0** ← Phase 2.A (S2.1 Python eval framework + S2.5 composition.md generator).
  - **v1.2.1 or v1.3.0** ← Phase 2.B (S2.2 migration tool + S2.4 A2A bridge). Both purely additive; v1.2.x patches if SDK-only, v1.3.0 minor if any spec touch surfaces during implementation.
  - **v2.0.0** ← Phase 2.C (S2.3 ISE trust-hierarchy fields). The **only** Phase 2 story that touches the envelope schema; closes drift candidate DC-1.
- **WHY** — Phase 2 turns ECL from "spec + bash SDK + TS SDK" into a **production-grade harness** with (1) measurable coordination quality (S2.1), (2) audit-lineage back-fill for pre-ECL work (S2.2), (3) defense-in-depth trust hierarchy (S2.3), (4) cross-org agent interop via A2A (S2.4), and (5) deterministic methodology generation (S2.5). The version split keeps backward compatibility cheap for adopters who only want the additive value, while reserving the v2.0 envelope for the one real shape change.
- **CONSTRAINTS**:
  - **Container constraint persists for Python.** Every `pip install`, `pytest`, `ruff`, `mypy`, build invocation runs INSIDE `reference-sdk/py/{Dockerfile.dev, compose.yml, Makefile}`. Base image: `python:3.12-slim`. No host-level Python / pip / uv pollution. Mirrors the TS tier's posture per `docs/tech-choice.md` and the maintainer's "all development inside containers" directive.
  - **Backward compatible.** v1.0 + v1.1 envelopes remain valid under v1.2 and v2.0. ISE fields (S2.3) are OPTIONAL with MAY-ignore semantics for receivers. The §1.1.1 `envelope_version` regex relaxes again at v2.0 from `^1\.[01](\.\d+)?$` to `^[12]\.\d+(\.\d+)?$`.
  - **Lock-step versioning** per `docs/tech-choice.md:42-45`: all SDKs move together on minor. The bash SDK stays at v1.1.x for Phase 2.A/2.B (no behavioural change needed), bumps to v2.0.x at Phase 2.C.
  - **Apache-2.0** across every new artefact.
  - **Deterministic outputs** are a hard requirement for S2.5 (byte-equivalent `composition.md` on identical inputs).
  - **Read-only A2A bridge** — S2.4 is a translator + Agent Card emitter. **No A2A server runtime, no inbound A2A request handling.** Out-of-process A2A clients call the emitted Agent Card; the bridge only converts inbound A2A `Message` objects to ECL envelopes for local consumption.
  - **No code execution from consumer config.** Generator (S2.5) reads `contracts/*.yaml` via `yaml.safe_load` only; no `eval`, no `exec`. Mirrors the nexus's `yaml → jq query → bash exec` discipline.
  - **CI gates updated.** The `conformance.yml` workflow's `ECL_VERSION matches latest spec file` check (per Phase 1.B precedent §[DECISION-S1]) MUST be updated at v1.2 and v2.0 tag boundaries.

---

## Decisions resolved

### [DECISION-P2-1] — Version strategy → **split (option b, refined): v1.2 for additive stories, v2.0 for ISE schema change**

**Resolution:** Reject the roadmap's "all Phase 2 → v2.0" label as a misnomer. Apply `spec/ecl-1.1.md` §7.1 SemVer rules **rigorously**:

| Story | Change shape | Version |
|---|---|---|
| S2.1 Python eval framework | Net-new SDK tier under `reference-sdk/py/`; consumes existing JSONL traces; no spec text, no schema change | **v1.2.0** (MINOR — additive) |
| S2.2 Migration tool | New Python module; produces v1.0/v1.1-conformant envelopes for legacy artefacts; no spec change | **v1.2.x** patch within v1.2 line, OR ship inside v1.2.0 |
| S2.4 A2A bridge | New Python module; emits Agent Card + translates A2A→ECL; no spec or schema change | **v1.2.x** patch within v1.2 line, OR ship inside v1.3.0 if it requires a new contract on an a2a→eidolon edge |
| S2.5 composition.md generator | New Python module + CI workflow on `eidolons` repo; consumes existing `contracts/*.yaml`; no spec change | **v1.2.0** (ships alongside S2.1; both Phase 2.A) |
| S2.3 ISE trust-hierarchy fields | **Additive optional envelope-level fields** + schema `$id` bump + first-time ISE fields → triggers DC-1 promotion | **v2.0.0** (MAJOR — by judgment, see below) |

**Why S2.3 is v2.0 (not v1.2 per option c):**

The §7.1 MINOR rule reads "additive changes — new OPTIONAL fields, new `x_*`-namespaced extensions promoted to first-class". A literal reading would route S2.3 to v1.2 (option c). However:

1. **DC-1 promotion semantics** — `docs/drift-register.md` DC-1 explicitly names "the first additive schema field" as the trigger for `$id` bumps. The `$id` bump is itself a breaking change for any external consumer that has hard-coded the v1.0.0 `$id` URI in their own ajv configuration. Per Phase 1.B §[DECISION-S2] rationale: "Changing `$id` would force the TS SDK to recompile schema references AND require any external vendor of the schema bundle to update their import paths." That cost falls under the §7.1 MAJOR rule "any change that invalidates existing v1 conformance."
2. **ISE semantics are receiver-mandating** — The ISE paper (arXiv ISE — Instructional Segment Embedding) defines a **trust hierarchy**: envelope-level instructions outrank payload-level instructions. A v1.x receiver that ignores ISE fields and treats payload-level instructions as authoritative is **silently downgrading the sender's security posture**. The MAY-ignore semantics keep the wire format additive but the **semantic contract is breaking**: a v2-aware receiver behaves differently than a v1 receiver on the same envelope. §7.1's "tightened constraints" rule applies in spirit.
3. **Pragmatic clean break** — Shipping ISE under v2.0 lets the spec carry a deprecation banner on `sha256@trust_level=high`, an MUST-promotion of HMAC at `trust_level=high` (closing Phase 1.B [ACTION-1]), and any other tightening that has accumulated since v1.0. Bundling produces one migration guide instead of three.

**Rejected alternatives:**
- **Option (a) "all Phase 2 → v2.0"** — overpays. Phase 2.A's Python eval framework and the composition.md generator are pure SDK-tier additions; tagging them v2.0 implies a migration story they don't need. Adopters would defer upgrading until they could absorb a major bump for code they could have consumed as v1.2.
- **Option (c) "ISE made additive → all v1.2"** — under-prices the `$id` bump. DC-1 in `docs/drift-register.md` explicitly named the first additive schema field as the trigger for `$id` churn; that's the MAJOR signal.

**Action:**
- Phase 2.A merges → tag **`v1.2.0`** (with companion ECL_VERSION bump file: `1.1` → `1.2`).
- Phase 2.B merges → tag **`v1.2.x`** patch within v1.2 line (or `v1.3.0` if scope creeps; default v1.2.x).
- Phase 2.C merges → tag **`v2.0.0`** with migration guide at `docs/migration-v1-to-v2.md` and updated §7.3 compatibility window note ("v2.0 receivers SHALL accept v1.x envelopes for at least 12 months").

### [DECISION-P2-2] — Sub-phase decomposition → **three sub-phases (Phase 2.A / 2.B / 2.C)**

**Resolution:**

| Sub-phase | Stories | PR | Tag | Effort | Hand-off labels |
|---|---|---|---|---|---|
| **Phase 2.A** | S2.1 Python eval framework + S2.5 composition.md generator | `feat/v1.2.0-py-sdk-and-composition-gen` | `v1.2.0` | **Large** (greenfield Python tier; container scaffold; new repo touchpoint at `Rynaro/eidolons`) | `apivr:py-scaffold`, `apivr:py-eval-framework`, `apivr:composition-generator`, `apivr:eidolons-ci-wiring` |
| **Phase 2.B** | S2.2 migration tool + S2.4 A2A bridge | `feat/v1.2.x-migration-and-a2a` | `v1.2.1` (or `v1.3.0` if spec touch) | **Medium** (two additive modules; reuses 2.A's container; A2A surface is well-scoped read-only) | `apivr:py-migration`, `apivr:py-a2a-bridge`, `idg:a2a-bridge-readme` |
| **Phase 2.C** | S2.3 ISE trust-hierarchy fields | `feat/v2.0.0-ise-fields` | `v2.0.0` | **Medium** (one schema field set + spec text + SDK mirrors in bash/TS/Py + migration guide; surface is small but consequential — major bump discipline) | `apivr:ise-schema`, `apivr:ise-spec`, `apivr:ise-bash`, `apivr:ise-ts`, `apivr:ise-py`, `idg:migration-guide` |

**Rationale:**

- **Decomposition principle: ship the foundation first, the additions second, the breaking change last.** Phase 2.A establishes the Python tier (the foundational tech-choice commitment from Phase 0 D-PHASE0-2). Phase 2.B builds on the Python tier with two narrow additive modules. Phase 2.C is the only sub-phase that requires a major bump — sequencing it last lets adopters consume the additive value at v1.2 without taking on a v2 migration until they're ready.
- **Why S2.1 + S2.5 together (Phase 2.A):** Both are "first Python module" work. S2.1 establishes the Python container scaffold; S2.5 reuses it. Each is small individually; together they amortize the scaffolding cost. S2.5's CI dance against `Rynaro/eidolons` (see [DECISION-P2-4]) is the only cross-repo touchpoint — landing it in 2.A bounds the cross-repo risk inside the foundational sub-phase.
- **Why S2.2 + S2.4 together (Phase 2.B):** Both are additive Python modules with no spec touch. Both consume the Python tier from 2.A. Bundling them halves the PR overhead (one branch, one review pass).
- **Why S2.3 alone (Phase 2.C):** It's the only v2.0-shaped change. Isolating it produces a clean, focused migration guide ("v1 → v2: ISE fields available, HMAC promoted to MUST at high-trust, schema `$id`s bumped").
- **Why three sub-phases instead of five PRs:** Five PRs is ~1 PR per story, which is the same rate as Phase 1.A (5 stories in 4 waves). However, Phase 2 stories cluster naturally into 3 thematic units (foundation / additions / break), and the per-PR review overhead for the maintainer is the dominant cost. Three PRs balance review economy against logical isolation.
- **Effort grading (Phase 1.B precedent):** Phase 1.A TS SDK port was "Large" (5 stories, container scaffold, 4 wave parallelism). Phase 1.B v1.1 spec bump was "Medium" (5 stories, no scaffolding). Phase 2.A is **Large** (greenfield Python tier mirrors 1.A's TS effort), 2.B is **Medium** (two scoped modules on existing scaffold), 2.C is **Medium** (small surface but cross-SDK + spec discipline).

**Rejected alternatives:**
- **Single PR for all five stories** — 3-5× the size of Phase 1.B per the prompt's own assessment. Review cost is the binding constraint.
- **Five separate PRs** — over-decomposed; S2.1 + S2.5 share Python scaffolding work that would be redundant if split.
- **Phase 2.A = S2.1 only, Phase 2.B = S2.2/S2.4/S2.5, Phase 2.C = S2.3** — option considered. Rejected because S2.5 is small and naturally co-lives with S2.1 (both want the Python container); separating them costs scaffolding duplication.

### [DECISION-P2-3] — A2A bridge repo strategy → **subdirectory `reference-sdk/py/a2a_bridge/` inside `eidolons-ecl`**

**Resolution:** A2A bridge ships as a subdirectory of the Python SDK. **Not a sibling repo.**

**Rationale:**

1. **Phase 0 principle** — `docs/tech-choice.md:127`: "Subdirectories inside `eidolons-ecl` (single source of truth; matches current `reference-sdk/bash/` layout). Revisit only if one tier outgrows the others." The A2A bridge is a tier (translation adapter), not a new methodology — it falls under the subdirectory rule.
2. **Lock-step versioning** — `docs/tech-choice.md:42-45`: minor versions move together. A sibling repo would need its own SemVer line, breaking lock-step.
3. **Shared types** — The A2A bridge needs the same `Envelope`, `Performative`, `AgentRef` types the Python SDK already defines. Sibling-repo separation would force a Python dependency on `eidolons-ecl-sdk-py`, adding pip-resolution surface for no architectural benefit.
4. **Operational simplicity** — One container (`reference-sdk/py/Dockerfile.dev`) covers both the SDK and the A2A bridge.
5. **Reversal trigger** — If A2A grows runtime requirements that contradict the SDK's library-only posture (e.g., requires a long-running HTTP server, additional deps that bloat the SDK install), revisit per `docs/tech-choice.md` R-F-1 ("Cross-tier coordination tax dominates"). For Phase 2's read-only bridge scope, no such risk surfaces.

**Layout:**

```
reference-sdk/py/
├── pyproject.toml
├── Dockerfile.dev
├── compose.yml
├── Makefile
├── src/
│   └── eidolons_ecl/
│       ├── __init__.py
│       ├── version.py            # ECL_VERSION_TARGET = "1.2" (or "2.0" at Phase 2.C)
│       ├── envelope.py           # build/verify (S2.1 dep)
│       ├── eval/                 # S2.1 eval framework
│       │   ├── __init__.py
│       │   ├── kpi.py            # coordination quality, topology efficacy, etc.
│       │   └── report.py
│       ├── migrate/              # S2.2 migration tool
│       │   ├── __init__.py
│       │   └── backfill.py
│       ├── a2a_bridge/           # S2.4 A2A bridge
│       │   ├── __init__.py
│       │   ├── agent_card.py     # emits /.well-known/agent-card.json
│       │   └── translator.py     # A2A Message → ECL envelope
│       └── compose_gen/          # S2.5 composition.md generator
│           ├── __init__.py
│           └── render.py
└── tests/
    └── ...
```

### [DECISION-P2-4] — S2.5 cross-repo strategy → **option (b) — generator lives in `eidolons-ecl`, invoked from `eidolons` CI**

**Resolution:** The generator code lives in `eidolons-ecl/reference-sdk/py/src/eidolons_ecl/compose_gen/`. The **invocation** lives in `Rynaro/eidolons`'s CI as a GitHub Actions workflow that:
1. Installs the latest pinned `eidolons-ecl-sdk-py` (vendor-as-single-file path; no pip dependency on a private package).
2. Runs the generator against the local `eidolons-ecl` clone (shallow git fetch by tag).
3. Compares the regenerated `methodology/composition.md` against `HEAD`'s version.
4. Fails the CI job on diff. (No auto-merge; the maintainer regenerates manually as part of any contracts/ change.)

**Rationale (load-bearing):**

- **Option (a) "auto-merging PR from eidolons-ecl CI"** — rejected. Cross-org auto-merge is fragile (GH Actions tokens have narrow write scope by default; granting cross-repo write scope is a security concession). Also: the eidolons-ecl repo doesn't know when contracts/ changes; the trigger ordering is awkward.
- **Option (b) "generator runs in eidolons CI"** — chosen. Ownership is clean: `eidolons-ecl` owns the generator code; `eidolons` owns the consumed artefact and its CI. The CI dependency is unidirectional (eidolons → eidolons-ecl, mirroring how the nexus already consumes ECL via roster). Determinism is enforceable via the existing `eidolons` CI matrix.
- **Option (c) "manual maintainer command"** — rejected. Acceptable as a tier-1 fallback but cannot satisfy the harness-roadmap acceptance gate "composition.md generator run is byte-deterministic (same `contracts/` → same Markdown)." Without CI enforcement, drift is inevitable — the maintainer will eventually edit composition.md by hand and forget to regenerate.

**Vendor-as-single-file is load-bearing here.** The `eidolons` repo cannot take a pip dependency on `eidolons-ecl-sdk-py` (that introduces Python tooling into a bash-CLI nexus). Instead, the v1.2.0 release ships a vendored `eidolons-ecl-sdk-py.bundle.py` artefact attached to the GH release; the `eidolons` CI workflow downloads it by tag pin, places it under `/tmp/`, runs `python3 -m eidolons_ecl.compose_gen --contracts <path> --out <path>`, diffs, fails on drift. Python 3.12 is required (matches the `python:3.12-slim` container base); `ubuntu-latest` runners have Python 3.12 available.

**Files affected:**
- `eidolons-ecl/reference-sdk/py/src/eidolons_ecl/compose_gen/render.py` — the generator.
- `eidolons-ecl/reference-sdk/py/tests/test_compose_gen.py` — determinism + golden-file tests.
- `eidolons-ecl/Makefile` — `make build-vendor-py` target produces the single-file bundle.
- `eidolons-ecl/.github/workflows/release.yml` — attaches `eidolons-ecl-sdk-py.bundle.py` to the v1.2.0 GH release.
- `eidolons/.github/workflows/composition-drift.yml` (new) — pulls the vendored bundle by tag pin, runs the generator, diffs against HEAD.
- `eidolons/methodology/composition.md` — replaced with the generated output on the merge commit (Phase 2.A first run).
- `eidolons/methodology/composition.md.template` (new) — the Jinja2 template the generator consumes for the prose-bracketing sections (preamble, "Reading left to right", anti-patterns) that are NOT derived from contracts/.

### [DECISION-P2-5] — Python packaging → **`hatch` (build backend) + `uv` (lockfile + pip-compile) + `tsup`-equivalent vendor build via `pyinstaller`-style or zipapp**

**Resolution:**

| Tool | Role | Rationale |
|---|---|---|
| **`hatch`** | Build backend (`hatchling`) and project manager | PEP 517/518-native; configured via `pyproject.toml`; widely-adopted modern Python build tool; minimal config; produces wheel + sdist; mirrors tsup's "zero-config wraps esbuild" pattern (hatchling wraps PEP 517 build) |
| **`uv`** | Dependency resolution + lockfile (`uv.lock`) + `pip install` replacement | Astral's uv is the fastest pip-compatible resolver (2026 industry standard); produces a verifiable lockfile; eliminates pip's resolver flake; container-friendly |
| **`pytest`** | Test runner | Standard; ECL eval needs parametrized fixtures (golden-file tests on trace JSONL inputs) |
| **`ruff`** | Linter + formatter | Replaces flake8 + black + isort in one tool; mirrors biome's "one tool" posture from the TS tier |
| **`mypy`** | Type checker (strict mode) | Mirrors the TS tier's `strict: true` posture |
| **`zipapp` (stdlib) for vendor bundle** | Single-file `.pyz` distribution | Python's stdlib equivalent of tsup's `--no-splitting` bundle; produces a single executable Python archive without external deps. Alternative: `shiv` or `pex` — both add a dependency; zipapp is stdlib and sufficient for our pure-Python scope |

**Rejected alternatives:**
- **`setuptools` + `pip` + `tox` + `black` + `flake8` + `isort` + `mypy`** — the "old stack." Functional but each tool is its own config file; the maintenance tax compounds.
- **`poetry`** — popular but slower resolver than uv; idiosyncratic lockfile format; less PEP-compliant historically. uv + hatch is the 2026 path.
- **`pdm`** — strong alternative to poetry/uv; rejected because uv has the larger contributor base and Astral's velocity.
- **`pyinstaller` for vendor bundle** — produces standalone binaries with bundled CPython; over-engineered for ECL's scale (10³ envelopes/day per `docs/tech-choice.md` C7). Adds platform-specific build complexity. `zipapp` (stdlib) is sufficient.

**Container base image:** `python:3.12-slim` (per prompt recommendation). Decision is load-bearing because:
- Python 3.12 has the stable `Self` type, `PEP 695` type parameters, structural pattern matching, and `tomllib` in stdlib.
- 3.12 is the latest stable as of 2026-05 (3.13 released 2024-10 but still ecosystem-stabilizing).
- Slim variant trims ~700MB; the SDK has no native build dependencies (pure-Python).

**Vendor-bundle target name:** `dist/eidolons-ecl-sdk.bundle.pyz`. Distribution path per `docs/tech-choice.md:128`:
- **Primary:** `pip install eidolons-ecl-sdk` to PyPI (deferred to a release PR after the SDK code merges).
- **Secondary:** vendor-as-single-file `.pyz` attached to GH release. Used by `eidolons` CI for S2.5 (per [DECISION-P2-4]).

### [DECISION-P2-6] — S2.3 schema `$id` bump trigger → **bump to `v2.0.0`; closes DC-1**

**Resolution:** All `schemas/*.json` `$id` URIs bump from `v1.0.0` (current pin) to **`v2.0.0`** at Phase 2.C. This closes drift candidate DC-1 per `docs/drift-register.md:170-191`.

**Affected files (12 schemas):**
- Six **core** schemas: `envelope.v1.json`, `performative.v1.json`, `handoff-contract.v1.json`, `context-delta.v1.json`, `handoff-event.v1.json`, `_base-profile.v1.json` → renamed to `*.v2.json`? **NO** — see filename decision below.
- Six **per-Eidolon** profile schemas under `schemas/per-eidolon/` → same posture.

**Filename decision (sub-decision):** Schema filenames stay at `*.v1.json` for the v1.x lineage AND new `*.v2.json` files are added for v2.0. Old files remain in-tree per the §7.3 12-month compatibility window. ajv resolves by `$id`, not filename — but external vendors who clone the repo and import by filename need a deterministic v2 filename. This mirrors the spec-file convention (`spec/ecl-1.0.md` + `spec/ecl-1.1.md` + `spec/ecl-2.0.md` coexist in-tree).

Concretely:
```
schemas/
├── envelope.v1.json              # $id: …/envelope.v1.json (v1.0/v1.1)
├── envelope.v2.json              # $id: …/envelope.v2.json (v2.0; adds ISE fields)
├── performative.v1.json          # unchanged
├── handoff-contract.v1.json      # unchanged (v2 spec doesn't change contract shape)
├── handoff-contract.v2.json      # NEW — only if v2 adds contract fields; OPTIONAL
└── ...
```

Only schemas that actually change at v2 get a new file. `envelope.v2.json` is mandatory (ISE fields). Others (performatives, contracts, events, context-delta, base-profile) bump only if Phase 2.C touches them; current Phase 2.C scope is **envelope-only**, so other schemas stay at v1.

**ISE fields specification (v2.0 envelope addition):**

Per arXiv ISE paper (Instructional Segment Embedding for prompt-injection defense), the v2.0 envelope adds an OPTIONAL top-level `ise` object:

```json
{
  "envelope_version": "2.0",
  ...
  "ise": {
    "trust_hierarchy": [
      { "source": "envelope", "level": "system", "scope": "envelope-fields" },
      { "source": "contract", "level": "developer", "scope": "performative-and-edge" },
      { "source": "payload", "level": "user", "scope": "artifact-bytes" }
    ],
    "segment_priority": "envelope > contract > payload"
  }
}
```

- **Semantics:** When `envelope.ise.trust_hierarchy` is present, receivers SHALL prioritize envelope-level instructions over payload-level instructions per the declared hierarchy. **MAY-ignore on the receive side** (per the prompt's clarification): a v1.x receiver that doesn't understand `ise` continues to operate; a v2-aware receiver applies the hierarchy.
- **Default hierarchy:** If `envelope.ise` is absent, the receiver behaves as v1.x (no hierarchy declared; payload-level instructions treated at the same level as envelope-level).
- **Schema field:** added under `$defs.ise` in `envelope.v2.json`; the existing `envelope.v1.json` is **unchanged** — v1.x envelopes that lack the field remain valid under v2 receivers (compatibility window).

**Drift register entry promotion:**
- DC-1 → **D-01** (first numbered entry) — status `promoted` at v2.0.0. The drift register adds:
  ```yaml
  id: D-01
  title: Schema $id versioning lag closed at v2.0.0
  discovered_at: "2026-05-12T00:00:00Z"
  discovered_via: external-report
  evidence:
    - schemas/envelope.v2.json — $id bumped to v2.0.0
    - schemas/*.v1.json — pre-v2 files retained for §7.3 compatibility window
  spec_section: §1.1 + §7.1
  warn_only_window:
    opened_at: v1.1.0
    target_promotion: MUST
    target_version: v2.0.0
  conformance_gate: E-3
  status: promoted
  notes: |
    Closed by Phase 2.C. The first additive schema field (envelope.ise)
    landed at v2.0.0; schema $ids bumped from v1.0.0 to v2.0.0 for the
    affected files. Old $ids remain valid for the 12-month compatibility
    window per §7.3.
  ```

---

## Sub-questions resolved (CLARIFY phase)

1. **What is the ECL_VERSION file value at the end of Phase 2?** — **`2.0`** at Phase 2.C tag. Phase 2.A bumps `ECL_VERSION` `1.1 → 1.2`; Phase 2.B stays at `1.2` (patch within v1.2.x); Phase 2.C bumps `1.2 → 2.0`.
2. **What is the Python SDK's `ECL_VERSION_TARGET` constant?** — `"1.2"` at Phase 2.A landing; bumps to `"2.0"` at Phase 2.C landing. Lock-step per `docs/tech-choice.md:42-45`.
3. **Does the Python eval framework consume the TS SDK's output?** — **No.** The Python eval reads `.eidolons/.trace/*.jsonl` files directly per the harness-roadmap acceptance gate. TS and Py SDKs are **independent peer implementations** of the same spec. Both write the same trace JSONL format (per `schemas/handoff-event.v1.json`); the eval consumes that format regardless of which SDK wrote it.
4. **For S2.4 A2A bridge: read-only adapter only, no A2A server runtime — confirm.** **Confirmed.** The bridge has two execution modes:
   - **Emit Agent Card** — pure file output: `python -m eidolons_ecl.a2a_bridge.agent_card --roster <path> --out <path>` produces `.well-known/agent-card.json`. No runtime server.
   - **Translate A2A Message → ECL envelope** — pure transformation: `python -m eidolons_ecl.a2a_bridge.translator --in <a2a-message.json> --out <envelope.json>` reads an inbound A2A `Message` (already received by some other host) and emits a conformant ECL envelope. No HTTP server, no listener, no daemon.
   - **Not in scope:** A2A `Task` lifecycle management, A2A streaming, A2A authentication. Those belong to Phase 3 (runtime engine).
5. **For S2.5 generator: deterministic output (byte-identical re-run) is a hard requirement.** **Confirmed.** Determinism mechanisms:
   - Contracts are read in **`LC_ALL=C` sorted order** by filename (mirrors `reference-sdk/bash/trace-tail.sh:51` pattern).
   - YAML parsing uses `yaml.safe_load`; Python dict ordering follows insertion order (PEP 468 guarantees from 3.7+).
   - Markdown is rendered via Jinja2 templates with `trim_blocks=True, lstrip_blocks=True` and explicit `\n` line endings.
   - No timestamps, no random IDs, no hostnames in the output. Generation is a pure function of `contracts/*.yaml` + the Jinja2 template.
   - Gate: `make compose-gen` produces byte-identical output on N runs (N=3 in CI).

---

## Stories

### S2.A.0 — Python tier scaffold (foundational for Phase 2.A/2.B; blocks S2.1, S2.2, S2.4, S2.5)

**Goal:** stand up the Python SDK container + `pyproject.toml` so subsequent stories can `from eidolons_ecl import ...` and run `make check` green.

**Owner:** APIVR-Δ subagent (`model: sonnet`, `isolation: worktree`). Branch: `feat/v1.2.0-py-sdk-and-composition-gen`.

**Files to create:**

- `reference-sdk/py/pyproject.toml` — name `eidolons-ecl-sdk`, version `1.2.0`, requires-python `>=3.12`, build-backend `hatchling.build`, dependencies `["jsonschema>=4.23", "pyyaml>=6.0.2", "jinja2>=3.1.4"]`, dev dependencies `["pytest>=8", "pytest-cov>=5", "ruff>=0.6", "mypy>=1.11", "uv>=0.4"]`, license `Apache-2.0`, classifiers (`Programming Language :: Python :: 3.12`, `License :: OSI Approved :: Apache Software License`).
- `reference-sdk/py/uv.lock` — generated by `uv lock` inside the container.
- `reference-sdk/py/Dockerfile.dev` — base `python:3.12-slim`; installs `uv` via the official install script; sets `WORKDIR /workspace/reference-sdk/py`; non-root `eclpy` UID 1000 (matches host UID per the maintainer's container ethos); `ENV UV_LINK_MODE=copy UV_CACHE_DIR=/uv-cache`.
- `reference-sdk/py/compose.yml` — service `py-sdk`; bind-mount repo root at `/workspace`; named volume `ecl-py-sdk-uv-cache` at `/uv-cache`; `command: bash`.
- `reference-sdk/py/Makefile` — targets:
  - `install` → `uv sync --frozen`
  - `build` → `uv build` + `python -m zipapp src/eidolons_ecl -o dist/eidolons-ecl-sdk.bundle.pyz -m "eidolons_ecl.__main__:main" --python "/usr/bin/env python3"`
  - `test` → `uv run pytest`
  - `lint` → `uv run ruff check . && uv run ruff format --check .`
  - `typecheck` → `uv run mypy src`
  - `check` → `install build test lint typecheck`
  - Wrapper: each target invokes `docker compose run --rm py-sdk make-internal-<target>` when run outside the container.
- `reference-sdk/py/.dockerignore`, `.gitignore`.
- `reference-sdk/py/README.md` — names the planned modules (`envelope`, `eval`, `migrate`, `a2a_bridge`, `compose_gen`); marks Phase 2.A scope.
- `reference-sdk/py/src/eidolons_ecl/__init__.py` — exports the planned symbols (stubbed until each story lands).
- `reference-sdk/py/src/eidolons_ecl/__main__.py` — entry point dispatching subcommands (`eval`, `migrate`, `a2a-card`, `a2a-translate`, `compose-gen`). Each subcommand stubs `raise NotImplementedError` until its story lands.
- `reference-sdk/py/src/eidolons_ecl/version.py` — `ECL_VERSION_TARGET: str = "1.2"` (bumps to `"2.0"` at Phase 2.C).
- `reference-sdk/py/src/eidolons_ecl/types.py` — hand-derived TypedDicts mirroring `schemas/envelope.v1.json` + relaxed `^1\.[12](\.\d+)?$` regex for `envelope_version`. Mirrors TS SDK's `types.ts` pattern from Phase 1.A.
- `reference-sdk/py/src/eidolons_ecl/errors.py` — `EclError(Exception)` with `code: str`, optional `gate: str`, optional `phase: Literal["py-jsonschema", "bash-checker"]`.
- `reference-sdk/py/tests/test_scaffold.py` — smoke test asserting `ECL_VERSION_TARGET == "1.2"` and all five subcommands are registered.

**Validation gates (all run INSIDE the container via `make`):**

- **G-S2.A.0-Build** — `make build` exits 0; emits `dist/eidolons_ecl_sdk-1.2.0-py3-none-any.whl`, `dist/eidolons_ecl_sdk-1.2.0.tar.gz`, `dist/eidolons-ecl-sdk.bundle.pyz`.
- **G-S2.A.0-Test** — `make test` exits 0; smoke test passes.
- **G-S2.A.0-Lint** — `make lint` exits 0.
- **G-S2.A.0-Typecheck** — `make typecheck` (mypy strict) exits 0.
- **G-S2.A.0-Check** — `make check` (install + build + test + lint + typecheck) exits 0 in one composite run.
- **G-S2.A.0-NoHost** — verify no `__pycache__`, `.venv`, `uv-cache` outside `reference-sdk/py/` and the named container volume.

**Confidence:** 0.92 (greenfield scaffolding; the TS tier's Phase 1.A scaffold landed cleanly, and the Python equivalent is mechanically similar).

---

### S2.1 — Python evaluation framework (Phase 2.A)

**Goal:** MultiAgentBench/MARBLE-style milestone KPIs over a thread of envelopes. Reads `.eidolons/.trace/*.jsonl`; computes coordination quality, topology efficacy (chain vs star vs graph), competition resilience, planning vs execution divergence. Emits a per-thread report.

**Owner:** APIVR-Δ subagent (`model: sonnet`, `isolation: worktree`). Branch: same as S2.A.0.

**Files to create:**

- `reference-sdk/py/src/eidolons_ecl/eval/__init__.py` — exports `evaluate_thread`, `KpiReport`, `TopologyClass`.
- `reference-sdk/py/src/eidolons_ecl/eval/kpi.py` — implements four KPI families:
  1. **Coordination quality** — for each thread, compute `decisions_per_envelope_ratio`, `refuse_rate`, `escalate_rate`. Threshold heuristics inform the verdict tier (`good | warn | poor`).
  2. **Topology efficacy** — classify the thread as `chain` (linear parent_id chain), `star` (one hub Eidolon receives from many), `graph` (DAG with multiple branches), or `degenerate` (cycle detected). Emit a verdict per class.
  3. **Competition resilience** — count `CRITIQUE` performatives; compute fraction relative to total envelopes. Higher fraction → stronger adversarial review surface.
  4. **Planning vs execution divergence** — for thread starting at SPECTRA (`PROPOSE` of `kind: spec`), compute the ratio of APIVR-Δ `ESCALATE` envelopes to SPECTRA `PROPOSE` envelopes. Higher ratio → plan-execution misalignment.
- `reference-sdk/py/src/eidolons_ecl/eval/report.py` — renders KPIs to Markdown + JSON. Markdown report goes to stdout (or `--out`); JSON to `--out-json`.
- `reference-sdk/py/src/eidolons_ecl/__main__.py` — `eval` subcommand: `python -m eidolons_ecl eval --trace-dir <path> [--thread <id>] [--out <md>] [--out-json <json>]`.
- `reference-sdk/py/tests/test_eval_kpi.py` — fixture-driven tests on the example chains in `eidolons-ecl/examples/`:
  - `examples/atlas-spectra-apivr-chain/` — expected: `topology=chain`, `coordination=good`, no `ESCALATE`.
  - `examples/apivr-vigil-escalation/` — expected: `topology=chain`, `escalate_rate > 0`, `competition_resilience: low` (no `CRITIQUE`).
  - Synthetic fixture: `tests/fixtures/star-topology.jsonl` — three Eidolons sending to one APIVR-Δ; expected `topology=star`.
- `reference-sdk/py/tests/fixtures/star-topology.jsonl` — synthetic trace JSONL.

**Out of scope:**

- Trace file rotation handling.
- Cross-thread aggregation (per-thread only in v1.2; cross-thread is Phase 3).
- Network/host hooks. Eval is pure file-in → file-out.

**Validation gates:**

- **G-S2.1-Build / Test / Lint / Check / Typecheck** (standard).
- **G-S2.1-Unit** — ≥85% line coverage on `eval/kpi.py`. All four KPI families covered; each verdict tier exercised at least once.
- **G-S2.1-Example-Pass** — `python -m eidolons_ecl eval --trace-dir examples/atlas-spectra-apivr-chain/.eidolons/.trace --out /tmp/report.md` produces a non-empty Markdown report; the report names all three Eidolons; topology is classified as `chain`.
- **G-S2.1-Determinism** — run `eval` on the same input 3 times; outputs are byte-identical (no timestamps in the output, sorted dict outputs).

**Confidence:** 0.87 (KPI definitions are well-bounded; the topology classifier is the main judgment surface — mitigated by synthetic fixtures covering each class).

---

### S2.5 — Generated `methodology/composition.md` (Phase 2.A)

**Goal:** Land a Python generator at `eidolons-ecl/reference-sdk/py/src/eidolons_ecl/compose_gen/` that regenerates `Rynaro/eidolons/methodology/composition.md`'s hand-off table from `eidolons-ecl/contracts/*.yaml`. CI gate in `Rynaro/eidolons` fails on regeneration drift.

**Owner:** APIVR-Δ subagent. Branch: same as S2.A.0.

**Files to create / modify in `eidolons-ecl`:**

- **Create:** `reference-sdk/py/src/eidolons_ecl/compose_gen/__init__.py` — exports `render_composition`.
- **Create:** `reference-sdk/py/src/eidolons_ecl/compose_gen/render.py` — loads `contracts/*.yaml` via `yaml.safe_load` in `LC_ALL=C` sorted filename order; passes the parsed contract list to a Jinja2 template; returns the rendered Markdown string.
- **Create:** `reference-sdk/py/src/eidolons_ecl/compose_gen/templates/composition.md.j2` — Jinja2 template with placeholders for the contracts-derived table; carries the static prose (preamble, "Reading left to right", anti-patterns, partial-team deployment) inline. NOT regenerated from contracts/.
- **Create:** `reference-sdk/py/tests/test_compose_gen.py` — golden-file test: renders against a curated `contracts/` subset and asserts byte-equality against `tests/fixtures/composition.expected.md`.
- **Create:** `reference-sdk/py/tests/fixtures/composition.expected.md` — golden file matching the current `Rynaro/eidolons/methodology/composition.md` (subject to refinement during implementation; the v1.2 generator output is the new source of truth).
- **Modify:** `reference-sdk/py/src/eidolons_ecl/__main__.py` — `compose-gen` subcommand: `python -m eidolons_ecl compose-gen --contracts <path> --template <path> --out <path>`.
- **Modify:** `Makefile` (repo root) — `build-vendor-py` target produces the `.bundle.pyz` and attaches it for release.

**Files to create / modify in `Rynaro/eidolons` (cross-repo touchpoint):**

- **Create:** `.github/workflows/composition-drift.yml` — workflow that:
  1. Triggers on PR + push to main.
  2. Downloads `eidolons-ecl-sdk.bundle.pyz` from the v1.2.0 GH release (pinned tag, not `latest`).
  3. Shallow-clones `Rynaro/eidolons-ecl@v1.2.0` to access `contracts/` and the template.
  4. Runs `python3 eidolons-ecl-sdk.bundle.pyz compose-gen --contracts $TMP/contracts --template $TMP/template.md.j2 --out /tmp/regen.md`.
  5. Runs `diff -u methodology/composition.md /tmp/regen.md`; fails on any diff.
- **Modify:** `methodology/composition.md` — replaced with the generated output on the merge commit.
- **Create:** `methodology/composition.md.template` — local copy of the Jinja2 template (or pointer to the eidolons-ecl tag — choice is the maintainer's; default: local copy for atomicity).

**Out of scope:**

- Auto-regeneration on contract edits (this is option (a) per [DECISION-P2-4]; rejected).
- Multi-template support (one template; one output file).
- Custom Markdown flavors (CommonMark output via Jinja2 + manual line discipline).

**Validation gates:**

- **G-S2.5-Build / Test / Lint / Check / Typecheck** (standard, in eidolons-ecl).
- **G-S2.5-Determinism** — run the generator 3 times on the same input; SHA-256 of each output is identical.
- **G-S2.5-Golden-File** — generator output against the curated `contracts/` set matches the committed `composition.expected.md` byte-for-byte.
- **G-S2.5-Cross-Repo-CI** — `Rynaro/eidolons` PR with no `contracts/` change has the `composition-drift` job green. A deliberate `contracts/atlas-to-spectra.yaml` edit (e.g., add a new artifact kind) causes the job to fail until `methodology/composition.md` is regenerated and committed.
- **G-S2.5-Vendor-Bundle** — `python3 dist/eidolons-ecl-sdk.bundle.pyz compose-gen --help` runs without import errors on a clean Python 3.12 installation (no pip install of eidolons-ecl-sdk required).

**Confidence:** 0.88 (the generator is mechanically simple; the cross-repo CI dance is the risk surface, mitigated by the unidirectional dependency model from [DECISION-P2-4]).

---

### S2.2 — Migration tool for legacy artefacts (Phase 2.B)

**Goal:** Walk `.spectra/`, `.atlas-scout/`, `.eidolons/.trace/` directories of arbitrary projects and back-fill v1.0 envelopes for prior un-enveloped artefacts. Idempotent. Useful for re-creating audit lineage on completed-but-pre-ECL work.

**Owner:** APIVR-Δ subagent (`model: sonnet`, `isolation: worktree`). Branch: `feat/v1.2.x-migration-and-a2a`.

**Files to create:**

- `reference-sdk/py/src/eidolons_ecl/migrate/__init__.py` — exports `backfill_directory`, `MigrationReport`.
- `reference-sdk/py/src/eidolons_ecl/migrate/backfill.py` — walks the supplied directory; for each known artefact pattern (`.spectra/*.md`, `.atlas-scout/scout-report*.md`, files matching `*completion-report.md`, etc.), generates a v1.0-conformant envelope with:
  - `envelope_version: "1.0"` (NOT v1.2 — the back-filled envelope describes a historical artefact, so it carries the spec version that was current at the artefact's mtime if knowable; default v1.0).
  - `message_id`, `thread_id` — UUIDv7 generated from the artefact's mtime (deterministic seed via `uuid7.from_unix_ms(int(mtime * 1000))` if a deterministic library is available; else random UUIDv4 acceptable per spec).
  - `from.eidolon` — inferred from the artefact filename pattern (e.g., `scout-report-*.md` → `atlas`).
  - `to.eidolon` — inferred from the parent directory or sibling files (heuristic; fall back to `orchestrator` if ambiguous).
  - `performative` — defaulted to `INFORM` (the historical artefact was a one-way emission without a declared recipient).
  - `objective` — derived from the artefact's first Markdown heading or filename.
  - `artifact.sha256` — computed from the file bytes at migration time.
  - `integrity.method: "sha256"`, `integrity.value: <sha256>`.
  - `trace.ts: <artefact-mtime-iso8601>`, `trace.host: "migrated"`, `trace.model: "unknown"`, `trace.tier: "standard"`.
- `reference-sdk/py/src/eidolons_ecl/migrate/heuristics.py` — pattern table mapping filename glob → (from-eidolon, kind). Examples:
  - `*scout-report*.md` → atlas, scout-report
  - `*completion-report*.md` → apivr, apivr-completion-report
  - `*root-cause-report*.md` → vigil, root-cause-report
  - `*reasoning-report*.md` → forge, reasoning-report
  - `*chronicle*.md` → idg, chronicle
- `reference-sdk/py/tests/test_migrate.py` — fixture-driven tests using a synthetic `.spectra/` tree.
- `reference-sdk/py/tests/fixtures/legacy-project/` — sample artefacts with no envelopes.
- `reference-sdk/py/src/eidolons_ecl/__main__.py` — `migrate` subcommand: `python -m eidolons_ecl migrate --dir <path> [--dry-run] [--report <md>]`.

**Idempotence requirement:**

- If a `<artefact>.envelope.json` sidecar already exists, the migration tool SHALL skip the artefact (no overwrite).
- A second run on the same directory produces zero new envelopes (verified by `MigrationReport.created_count == 0`).

**Out of scope:**

- Cross-artefact thread inference (i.e., linking ATLAS scout-report → SPECTRA spec → APIVR completion-report into a single thread). Each artefact gets its own thread for v1.2. Thread inference is Phase 3.
- Backfill of v1.1-shaped envelopes. The tool emits v1.0 envelopes only (most-conservative compatibility).

**Validation gates:**

- **G-S2.2-Build / Test / Lint / Check / Typecheck** (standard).
- **G-S2.2-Unit** — ≥85% line coverage on `migrate/backfill.py`.
- **G-S2.2-Idempotence** — running `migrate` on the same fixture directory twice produces identical filesystem state; second run reports `created_count: 0`.
- **G-S2.2-Conformance** — every back-filled envelope passes `bash conformance/check.sh --level=MUST` (run inside the dev container; `jq + bash` already installed).
- **G-S2.2-Real-World** — run `migrate` against `Rynaro/eidolons/.spectra/` (the actual `eidolons` repo's `.spectra/` directory containing 13 spec files); zero conformance failures.

**Confidence:** 0.85 (heuristics for filename → eidolon are judgment-based; the real-world gate exposes any mismatch with actual artefact patterns).

---

### S2.4 — A2A bridge (Phase 2.B)

**Goal:** Read-only adapter that emits an Agent Card from the Eidolons roster + converts inbound A2A `Message` objects to ECL envelopes. Not a full A2A server — just a translator.

**Owner:** APIVR-Δ subagent (`model: sonnet`, `isolation: worktree`). Branch: same as S2.2.

**Files to create:**

- `reference-sdk/py/src/eidolons_ecl/a2a_bridge/__init__.py` — exports `emit_agent_card`, `translate_a2a_message`.
- `reference-sdk/py/src/eidolons_ecl/a2a_bridge/agent_card.py` — reads `roster/index.yaml` (from the `eidolons` repo, or supplied path); emits `.well-known/agent-card.json` per the A2A Agent Card schema (https://a2a.dev/specs/agent-card). Fields:
  - `name`: e.g., `"eidolons-aggregate"` or per-Eidolon (the roster names each).
  - `description`: derived from each Eidolon's `methodology.cycle` (e.g., "ATLAS — Read-only codebase scout, A→T→L→A→S cycle").
  - `version`: from `versions.latest` per Eidolon.
  - `skills`: derived from `handoffs.downstream` (each downstream edge becomes a skill).
  - `endpoints`: none (read-only bridge; the Eidolons are invoked by the host LLM, not by HTTP).
- `reference-sdk/py/src/eidolons_ecl/a2a_bridge/translator.py` — takes an inbound A2A `Message` (JSON object); produces a conformant ECL envelope:
  - A2A `Message.role` (`user` | `agent`) → ECL `performative` (`REQUEST` if user, `PROPOSE` if agent).
  - A2A `Message.parts[].text` → ECL `artifact` (written to a temp file; `artifact.kind: "a2a-message"`; `artifact.sha256` computed).
  - A2A `Message.metadata` (custom field) → ECL `assumptions[]`.
  - `from.eidolon: "a2a-external"`, `to.eidolon: <target-eidolon>` (caller-supplied).
  - `trust_level: "low"` (per §6.3 — external sources default to low).
- `reference-sdk/py/src/eidolons_ecl/__main__.py` — two subcommands:
  - `a2a-card` — `python -m eidolons_ecl a2a-card --roster <path> --out <path>`.
  - `a2a-translate` — `python -m eidolons_ecl a2a-translate --in <a2a-msg.json> --to <eidolon> --out <envelope.json>`.
- `reference-sdk/py/tests/test_a2a_bridge.py` — round-trip test: take a synthetic A2A `Message` → translate to ECL envelope → run through `envelopeVerify` → verify clean.
- `reference-sdk/py/tests/fixtures/a2a-message-sample.json` — synthetic A2A Message.
- `reference-sdk/py/tests/fixtures/agent-card.expected.json` — golden file for the Agent Card output against a curated roster subset.

**Out of scope:**

- A2A server runtime (no HTTP handler, no listener, no daemon).
- A2A streaming or `Task` lifecycle.
- A2A authentication (no JWT, no API key).
- A2A → outbound (the bridge is one-way: A2A in → ECL envelope; the reverse direction is Phase 3).

**Validation gates:**

- **G-S2.4-Build / Test / Lint / Check / Typecheck** (standard).
- **G-S2.4-Unit** — ≥85% line coverage on `a2a_bridge/`.
- **G-S2.4-Agent-Card-Validity** — emitted Agent Card validates against the A2A Agent Card JSON Schema (download once during test setup; cached). If the upstream schema URL is unavailable in CI, fall back to a vendored copy at `tests/fixtures/a2a-agent-card.schema.json`.
- **G-S2.4-Round-Trip** — A2A Message → translate → envelope → `bash conformance/check.sh` → exit 0.

**Confidence:** 0.83 (the A2A spec is external and may have version skew; mitigated by vendoring the schema; the translation logic is bounded — three fields).

---

### S2.3 — ISE-style trust hierarchy fields (Phase 2.C; v2.0.0)

**Goal:** Add OPTIONAL envelope-level `ise` field per arXiv ISE paper. Defends against prompt-infection by letting receivers prioritize envelope-level instructions over payload-level. MAY-ignore on receive. Closes drift candidate DC-1.

**Owner:** APIVR-Δ subagent (sequence of three sub-subagents for atomicity) + IDG subagent for the migration guide.

**Sequence:**

#### S2.3.a — Spec text + envelope.v2.json schema

**Owner:** APIVR-Δ subagent. Branch: `feat/v2.0.0-ise-fields`.

**Files to create:**

- `spec/ecl-2.0.md` — copy of `spec/ecl-1.1.md` with the following edits:
  1. Header: `**Version:** 1.1` → `2.0`; `**Published:** 2026-05-12` → PR-merge date.
  2. §1.1.1 envelope_version regex: `^1\.[01](\.\d+)?$` → `^[12]\.\d+(\.\d+)?$` (v2.0 receivers accept v1.x and v2.x envelopes per the §7.3 12-month compatibility window).
  3. §1.2 — add a new row to the Optional but RECOMMENDED fields table: `ise | object | Trust hierarchy per §6.5. RECOMMENDED at trust_level=high; OPTIONAL otherwise.`
  4. §6 — add a new subsection **§6.5 — ISE trust hierarchy (v2.0+)**:
     > **§6.5 — ISE (Instructional Segment Embedding) trust hierarchy**
     >
     > When present, `envelope.ise` declares a trust hierarchy over the message segments. Receivers SHALL prioritize segments in the declared order: envelope-level instructions outrank contract-level, which outrank payload-level. This defends against indirect prompt injection where adversarial content in the payload attempts to override the sender's declared intent.
     >
     > §6.5.1 — **OPTIONAL**: `envelope.ise` is OPTIONAL at all trust levels.
     >
     > §6.5.2 — **RECOMMENDED**: at `trust_level=high`, emitters SHOULD include `envelope.ise` with at least the canonical hierarchy: `envelope > contract > payload`.
     >
     > §6.5.3 — **MAY-ignore**: v1.x receivers ignore `envelope.ise` (the field is unknown to their parser). v2.x receivers SHALL apply the hierarchy.
     >
     > §6.5.4 — **MUST**: when `envelope.ise.trust_hierarchy` is present, the array SHALL contain entries with `{source, level, scope}` where `source` ∈ `{envelope, contract, payload, system}`, `level` ∈ `{system, developer, user}` (per ISE paper § "Hierarchical Layers"), and `scope` is a free-form descriptor of which fields the segment governs.
     >
     > §6.5.5 — **SHALL**: receivers that honor ISE SHALL treat payload content as **data, not instructions** when `envelope.ise.segment_priority` declares `envelope > payload`. This composes with §6.3's `trust_level=low` directive.
  5. §6.1 — promote HMAC: change `hmac-sha256` row from `**RECOMMENDED** at trust_level=high` to `**MUST** at trust_level=high` (closes Phase 1.B [ACTION-1]).
  6. §6.2.6 — promote I-5 from SHOULD-warn (exit 4) to MUST-fail (exit 2) when `trust_level=high` AND `integrity.method=sha256`.
  7. §7.1 — add a sentence noting v2.0 ships with `envelope.v2.json` (`$id` bumped from v1.0.0 to v2.0.0) per the drift register D-01.
  8. §7.3 — add a paragraph: "v2.0 receivers SHALL accept v1.x envelopes for at least 12 months from v2.0.0 publication (2026-05-XX through 2027-05-XX)."
  9. §7.5 — note: v2.0.0 deprecates no fields; ISE is purely additive.
  10. Citations — add the ISE paper reference.
- `schemas/envelope.v2.json` — new file. `$id`: `https://github.com/Rynaro/eidolons-ecl/blob/main/schemas/envelope.v2.json`. All v1.json fields preserved; adds `ise` object:
  ```json
  "ise": {
    "type": "object",
    "properties": {
      "trust_hierarchy": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": { "type": "string", "enum": ["envelope", "contract", "payload", "system"] },
            "level": { "type": "string", "enum": ["system", "developer", "user"] },
            "scope": { "type": "string" }
          },
          "required": ["source", "level", "scope"]
        }
      },
      "segment_priority": { "type": "string" }
    }
  }
  ```
- `docs/migration-v1-to-v2.md` — new migration guide (S2.3.b owns this via IDG).
- **Modify:** `ECL_VERSION` — `1.2` → `2.0`.
- **Modify:** `.github/workflows/release.yml` — release asset list now includes `spec/ecl-2.0.md` in addition to `spec/ecl-1.1.md` and `spec/ecl-1.0.md`.
- **Modify:** `.github/workflows/conformance.yml` — `ECL_VERSION matches latest spec file` check expects `spec/ecl-2.0.md`.
- **Modify:** `README.md` — bump anchors to `spec/ecl-2.0.md`.
- **Modify:** `CHANGELOG.md` — add `[2.0.0]` entry below `[Unreleased]`.
- **Modify:** `docs/drift-register.md` — promote DC-1 to D-01 (status `promoted`).

#### S2.3.b — Migration guide (IDG)

**Owner:** IDG subagent (synthesis-only).
**Files to create:**

- `docs/migration-v1-to-v2.md` — covers:
  1. **Backward compatibility window** — v2.0 receivers accept v1.x envelopes through 2027-05-XX.
  2. **Schema $id changes** — `envelope.v1.json` and `envelope.v2.json` coexist; vendors importing schemas by `$id` MUST update to v2.0.0 URIs to consume the new `ise` field validator.
  3. **HMAC promotion** — at v2.0, `trust_level=high` envelopes MUST use `hmac-sha256` (was RECOMMENDED at v1.1). Migration path: any v1.x emitter using `trust_level=high + sha256` will fail v2.0 conformance; the emitter must switch to `hmac-sha256` OR downgrade `trust_level` to `standard`.
  4. **ISE adoption** — OPTIONAL; v1.x emitters can stay on v1.x indefinitely (within the 12-month window). When ready, set `envelope_version: "2.0"` and add `envelope.ise.trust_hierarchy`. Receivers that ignore `ise` continue to function (v1-style; weaker security posture per §6.5.5).
  5. **Conformance gate changes** — list every I-, E-, C-, D- gate level shift from v1.1 to v2.0.

#### S2.3.c — Bash + TS + Python SDK mirrors

**Owner:** APIVR-Δ subagent (parallel x 3 by tier).

**Files modified:**

- **Bash** (`reference-sdk/bash/`, `conformance/`) — `envelope-build.sh` accepts a new `--ise-default` flag (no-op if false; injects the canonical hierarchy if true). `conformance/lib/integrity.sh` I-5: level changes from SHOULD-warn (exit 4) to MUST-fail (exit 2). `conformance/check.sh` accepts envelopes with `envelope_version: "2.0"`.
- **TS** (`reference-sdk/ts/`) — `envelopeBuild` accepts `iseDefault?: boolean` option. `envelopeVerify` validates against `envelope.v2.json` when `envelope_version: "2.0"`. `package.json` version `1.1.1` → `2.0.0`; `ECL_VERSION_TARGET` `"1.1"` → `"2.0"`.
- **Python** (`reference-sdk/py/`) — `envelope.build` accepts `ise_default: bool = False`. `envelope.verify` validates against the appropriate schema by version. `pyproject.toml` version `1.2.0` (or `1.2.x`) → `2.0.0`; `version.py` `ECL_VERSION_TARGET = "2.0"`.

**Validation gates (for the whole S2.3):**

- **G-S2.3-Spec-Files** — `spec/ecl-2.0.md` exists; `ECL_VERSION` is `2.0`; `yq eval` on all workflow YAML passes.
- **G-S2.3-Schema-Valid** — `jq empty schemas/envelope.v2.json` passes; the schema validates a hand-crafted v2 envelope fixture.
- **G-S2.3-Conformance-Backcompat** — every existing fixture under `conformance/tests/fixtures/` (built at v1.0/v1.1) still passes conformance under v2.0 checker (compatibility window §7.3).
- **G-S2.3-ISE-Fixture** — new fixture `conformance/tests/fixtures/v2-ise-canonical/` carries `envelope_version: "2.0"` + canonical `ise.trust_hierarchy`; passes all MUST gates.
- **G-S2.3-HMAC-Promotion** — fixture `conformance/tests/fixtures/v2-high-trust-sha256/` carries `trust_level: high + integrity.method: sha256 + envelope_version: "2.0"`; conformance exit code is 2 (MUST-fail), not 4 (was warn in v1.1). Backward-check: same shape with `envelope_version: "1.1"` still exits 4 (the v1.1 SHOULD level).
- **G-S2.3-SDK-Round-Trip** — bash/TS/Py SDKs all emit + verify v2 envelopes; cross-SDK interop passes per the harness-roadmap.md:156 invariant.
- **G-S2.3-Migration-Guide** — `docs/migration-v1-to-v2.md` exists; covers all five sections per S2.3.b.
- **G-S2.3-DC-1-Promoted** — `docs/drift-register.md` shows D-01 with `status: promoted`.

**Confidence:** 0.86 (the schema addition is bounded; the cross-SDK mirror requires three coordinated PRs but each is small; the migration guide is judgment-bounded but the IDG CHT gate keeps it honest).

---

## TRANCE sequencing

```
Phase 2.A (single PR, four waves):
  Wave I  (serial):       S2.A.0 — Python tier scaffold
  Wave II (parallel × 2): S2.1 — Python eval framework  ║  S2.5 — composition.md generator
  Wave III (serial):      Phase 2.A finalization — tag v1.2.0, attach vendored .pyz to GH release

Phase 2.B (single PR, two waves):
  Wave I  (parallel × 2): S2.2 — migration tool  ║  S2.4 — A2A bridge
  Wave II (serial):       Phase 2.B finalization — tag v1.2.x

Phase 2.C (single PR, three waves):
  Wave I  (serial):       S2.3.a — spec + schema (envelope.v2.json + spec/ecl-2.0.md)
  Wave II (parallel × 3): S2.3.c bash mirror  ║  S2.3.c TS mirror  ║  S2.3.c Py mirror
  Wave III (parallel × 2): S2.3.b — migration guide (IDG)  ║  S2.3-DC-1 promotion (drift register update)
  Wave IV (serial):       Phase 2.C finalization — tag v2.0.0
```

- **Wave II parallelism per the memory note** — when fanning out 2+ subagents in the same wave, all but one MUST use `isolation: "worktree"` to avoid clobbering the branch. In every wave above with parallelism, all subagents use `isolation: worktree` except the parent-anchored one.
- **APIVR-Δ subagents are `model: sonnet`** per the standing memory rule.
- **IDG subagents are synthesis-only** with no retrieval; they consume the spec text already authored in S2.3.a + the threat model + the drift-register and produce the migration guide.

---

## Container constraint (load-bearing)

Every gate listed above runs inside the `reference-sdk/py/` dev container via:

```
make install     # uv sync --frozen
make build       # uv build + zipapp bundle
make test        # uv run pytest
make lint        # uv run ruff check + format --check
make typecheck   # uv run mypy src
make check       # install + build + test + lint + typecheck (CI parity)
```

Stories MUST NOT assume host-level `python`, `pip`, `uv`, `pytest`, `ruff`, or `mypy`. The host MUST stay free of Python toolchain pollution per `docs/tech-choice.md` and the maintainer's "all development inside containers" directive.

`bash conformance/check.sh` ALSO runs inside the container — the Dockerfile installs `jq` + `bash` (mirrors the TS tier's `Dockerfile.dev:22-30` pattern from Phase 1.A).

The `uv-cache` named volume persists between `compose run` invocations so installs are warm-cache fast.

---

## Backward compatibility invariants

- v1.0 envelopes remain valid under v1.1 receivers (already true).
- v1.0 + v1.1 envelopes remain valid under v1.2 receivers (Phase 2.A/2.B do not touch envelope semantics).
- v1.0 + v1.1 + v1.2 envelopes remain valid under v2.0 receivers for 12 months (§7.3 compatibility window).
- v1.x envelopes that lack `envelope.ise` continue to function under v2.x receivers — receivers fall back to the v1.x security posture.
- Schema `$id` URIs at v1.0.0 remain valid; new `$id`s at v2.0.0 coexist. External vendors who pin v1.0.0 `$id`s see no change.
- The bash SDK at v1.1.x remains in-tree at Phase 2.A/2.B; bumps to v2.0.x only at Phase 2.C.
- The TS SDK at v1.1.x remains in-tree at Phase 2.A/2.B; bumps to v2.0.x only at Phase 2.C.
- HMAC at `trust_level=high`: RECOMMENDED in v1.1 (warn-only I-5 exit 4), still RECOMMENDED in v1.2 (no change), **MUST** in v2.0 (exit 2). Migration path: emitters using `trust_level=high + sha256` MUST switch to `hmac-sha256` OR downgrade `trust_level` before adopting v2.0 envelope_version.

---

## Cross-repo / cross-organizational risks (for the maintainer)

| ID | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R-P2-1 | The composition.md drift CI workflow in `Rynaro/eidolons` becomes flaky due to GH-release-asset download race (S2.5). | Medium | Pin the tag exactly (no `latest`). Use `actions/download-artifact` or `gh release download` with retry logic. The vendor `.pyz` is small (<200KB); the download is fast. |
| R-P2-2 | The A2A spec evolves while Phase 2.B is in flight, invalidating the vendored A2A Agent Card schema. | Low | The vendored schema is pinned to a specific A2A version. If A2A breaks compatibility, S2.4 stays on the pinned version; a future minor PR adopts the newer A2A spec. R-F-1 (cross-tier coordination tax) does NOT apply because the A2A bridge is read-only and bounded. |
| R-P2-3 | ISE field semantics differ between the arXiv paper and downstream interpretations once external implementers adopt v2.0. | Medium | Phase 2.C spec text quotes the arXiv ISE paper's normative language verbatim where possible. §6.5 specifies the wire format; semantic interpretation is the receiver's responsibility. Disputes are tracked as new drift register entries. |
| R-P2-4 | The Python tier ramps slower than the maintainer's single-maintainer capacity (R-F-4 from tech-choice). | Medium | Phase 2.A is the largest sub-phase. If capacity bites, defer Phase 2.B to v1.3.0 (push the timeline by one minor cycle) rather than splitting sub-phases mid-flight. Phase 2.C can ship on its own timeline as v2.0.0 once Phase 2.A is stable. |
| R-P2-5 | Schema `$id` bump (Phase 2.C) breaks external ajv consumers that hard-coded the v1.0.0 URIs. | Low–Medium | The migration guide enumerates the affected `$id`s. The 12-month §7.3 window keeps v1 `$id`s resolvable. The drift register D-01 entry documents the bump. **This is the strongest argument for treating Phase 2.C as v2.0 (not v1.2).** |
| R-P2-6 | Cross-org auto-merge (rejected per [DECISION-P2-4] option a) — even option b's "eidolons CI pulls from eidolons-ecl release" has a token-scope edge case: `Rynaro/eidolons` workflow needs read access to `Rynaro/eidolons-ecl` releases. | Low | GitHub Actions' default `GITHUB_TOKEN` already has cross-repo read access for public repos. Both repos are public per the project's history. If either ever becomes private, the workflow needs a fine-grained PAT or a deploy key — flagged but unlikely to bite. |
| R-P2-7 | HMAC promotion (`trust_level=high + sha256` → exit 2) breaks existing v1.x-emitting downstream Eidolons at v2.0 adoption. | Medium | Adoption of `envelope_version: "2.0"` is opt-in per Eidolon (§7.2 per-Eidolon declaration). An Eidolon staying at `ECL_VERSION: 1.1` is unaffected. The migration guide gives a clear migration path. **No silent breakage** — v1.1 envelopes are still valid under v2.0 receivers; only v2.0-shaped envelopes face the new MUST. |

---

## Out of scope (this PHASE 2)

- npm + pip publish — happens in separate release PRs after the SDK code merges.
- A2A `Task` lifecycle / streaming / authentication — Phase 3.
- Cross-thread eval aggregation — Phase 3.
- Auto-thread inference in the migration tool — Phase 3.
- Runtime engine that automates envelope emission inside hosts — Phase 3.
- GUI/TUI envelope inspector — Phase 3.
- OpenTelemetry exporters — Phase 3.
- ANP/DID cross-organization Eidolon discovery — Phase 3.
- Per-Eidolon `ECL_VERSION` bumps to `1.2` or `2.0` across the five Eidolon repos — tracked as cascading [ACTION] items per Phase 1.B precedent [ACTION-2].

---

## Acceptance (per-phase)

### Phase 2.A — `v1.2.0`

1. S2.A.0 closes all 6 gates.
2. S2.1 closes all 7 gates.
3. S2.5 closes all 6 gates including the cross-repo CI gate.
4. `make check` exits 0 inside the dev container.
5. No host-level `__pycache__` / `.venv` / `uv-cache` artefacts outside `reference-sdk/py/` and the named container volume.
6. `Rynaro/eidolons` PR closing the loop on `composition.md` regeneration merges green.
7. Tag `v1.2.0` produces a GH release with `spec/ecl-1.1.md` (current), `spec/ecl-1.0.md` (archival), and `dist/eidolons-ecl-sdk.bundle.pyz` attached.

### Phase 2.B — `v1.2.x` or `v1.3.0`

1. S2.2 closes all 6 gates including the real-world `.spectra/` migration.
2. S2.4 closes all 5 gates including A2A Agent Card schema validity.
3. `make check` exits 0.
4. Tag `v1.2.x` (or `v1.3.0` if a spec-touch surfaces) produces a GH release with the migration tool + A2A bridge in the bundled SDK.

### Phase 2.C — `v2.0.0`

1. S2.3.a closes all 5 spec/schema gates.
2. S2.3.b closes the IDG CHT gate for `docs/migration-v1-to-v2.md`.
3. S2.3.c closes all 6 cross-SDK round-trip gates.
4. D-01 is promoted to `status: promoted` in the drift register.
5. `ECL_VERSION` is `2.0` at PR merge.
6. Tag `v2.0.0` produces a GH release with `spec/ecl-2.0.md`, `spec/ecl-1.1.md` (archival within 12-month window), `spec/ecl-1.0.md` (archival), all bash/TS/Py SDK bundles, and `docs/migration-v1-to-v2.md`.

---

## Confidence at Assemble: 0.90

**Generator pass** produced the initial decomposition; **Evaluator pass** flagged three weaknesses; **Refine pass** corrected:

1. **Initial draft had Phase 2.A = S2.1 only** — Refine moved S2.5 into Phase 2.A because both want the Python scaffold and S2.5 is too small to anchor its own sub-phase.
2. **Initial draft had S2.3 splitting bash + TS + Py into separate PRs** — Refine consolidated into a single Phase 2.C PR with internal wave parallelism, mirroring Phase 1.A's TRANCE pattern.
3. **Initial draft pinned ECL_VERSION at `1.2` at Phase 2.A and missed the Python `ECL_VERSION_TARGET` constant** — Refine added explicit lock-step mapping per `docs/tech-choice.md:42-45`.

Remaining uncertainty (driving the gap from 0.90 to 1.0):

- The cross-repo CI dance in S2.5 has one moving part (GH release asset download). Mitigated by tag pinning but not eliminated.
- The migration tool's filename heuristics (S2.2) are judgment-based; the real-world fixture against `Rynaro/eidolons/.spectra/` is the strongest validation but may surface edge cases.
- The arXiv ISE paper's normative language for `level` and `scope` semantics is a single-source citation; downstream interpretations may diverge. Mitigated by quoting the paper verbatim in §6.5.

Above 0.85 → Assemble (not Refine again).

---

## Hand-off labels

| Story | Sub-phase | Label | Subagent |
|---|---|---|---|
| S2.A.0 | 2.A | `apivr:py-scaffold` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.1 | 2.A | `apivr:py-eval-framework` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.5 (generator) | 2.A | `apivr:composition-generator` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.5 (eidolons CI) | 2.A | `apivr:eidolons-ci-wiring` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.2 | 2.B | `apivr:py-migration` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.4 | 2.B | `apivr:py-a2a-bridge` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.4 (docs) | 2.B | `idg:a2a-bridge-readme` | IDG, synthesis-only |
| S2.3.a | 2.C | `apivr:ise-spec`, `apivr:ise-schema` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.3.c bash | 2.C | `apivr:ise-bash` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.3.c TS | 2.C | `apivr:ise-ts` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.3.c Py | 2.C | `apivr:ise-py` | APIVR-Δ, model: sonnet, isolation: worktree |
| S2.3.b | 2.C | `idg:migration-guide` | IDG, synthesis-only |

Parallel waves: all but one subagent per wave uses `isolation: "worktree"` per the standing memory rule.

---

## Provenance

- Roadmap parent: `/Users/henrique/workspace/oss/agents/eidolons/.spectra/harness-roadmap.md` §"Phase 2 — ECL v2.0" (authored 2026-05-08).
- Phase 0 ground: `/Users/henrique/workspace/oss/agents/eidolons-ecl/docs/tech-choice.md` (committed 2026-05-11).
- Phase 1.A precedent: `/Users/henrique/workspace/oss/agents/eidolons-ecl/.spectra/ts-sdk-port.md` (TS SDK port, landed 2026-05-11).
- Phase 1.B precedent: `/Users/henrique/workspace/oss/agents/eidolons-ecl/.spectra/v1.1-spec-bump.md` (v1.1 spec bump, landed 2026-05-12).
- Current spec: `/Users/henrique/workspace/oss/agents/eidolons-ecl/spec/ecl-1.1.md` §7.1 (SemVer rules).
- Drift register: `/Users/henrique/workspace/oss/agents/eidolons-ecl/docs/drift-register.md` (DC-1 = schema $id versioning lag, promoted to D-01 at Phase 2.C).
- Target generated artefact (S2.5): `/Users/henrique/workspace/oss/agents/eidolons/methodology/composition.md`.
- Source contracts (S2.5 input): `/Users/henrique/workspace/oss/agents/eidolons-ecl/contracts/*.yaml` (19 contracts at writing).
- Spec authored: SPECTRA v4.2.11 — 2026-05-11, TRANCE tier G3, 1 Refine cycle.
- Companion: `/Users/henrique/workspace/oss/agents/eidolons-ecl/.spectra/phase2-scoping.yaml` (machine-readable hand-off contract).
