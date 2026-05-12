# Phase 2.A — Build chronicle (ECL v1.2.0)

## Summary

Phase 2.A of `harness-roadmap.md` landed: the Python tier of the
multi-language harness shipped as **ECL v1.2.0**. Work flowed SPECTRA
TRANCE evaluator-optimizer pass → three sequential APIVR-Δ subagent
passes (S2.A.0 scaffold, S2.1 eval, S2.5 compose-gen) → parent
documentation + spec-bump pass. Final state: **46 tests passing**,
container-first build green (`make check` exits 0), Python tier ready
for Phase 2.B's `migrate` + `a2a_bridge` modules.

## Context

- **Phase 0** (`docs/tech-choice.md`, committed 2026-05-11) chose
  **Option F — multi-language tiers** (bash canonical + TS for hosts +
  Python for eval/tooling). All four resolved D-PHASE0-N decisions
  (subdirectory layout, pip + vendor distribution, lock-step versioning,
  Apache-2.0) carry forward.
- **Phase 1.A** (TS SDK port, `f3cff29` on `feat/v1.1.0-ts-sdk`) shipped
  the TypeScript tier at API parity with bash. Chronicle:
  `.idg/ts-sdk-phase1-chronicle.md`.
- **Phase 1.B** (v1.1 spec bump) landed via PR body alone — no chronicle.
- **Phase 2.A** (this chronicle) lands the Python tier as a net-new
  capability — eval framework + composition.md generator. Greenfield;
  not a port.

## Work performed

Chronological:

1. **SPECTRA TRANCE pass** (`.spectra/phase2-scoping.md` +
   `.spectra/phase2-scoping.yaml`). G3 evaluator-optimizer; confidence
   0.90; **1 Refine cycle**. Output: six **D-P2-N** decisions resolved,
   five stories scoped, three sub-phases recommended (2.A / 2.B / 2.C).
   Stories in scope for this PR: S2.A.0 + S2.1 + S2.5.
2. **S2.A.0 scaffold** (APIVR-Δ subagent, `model: sonnet`, `isolation:
   worktree`). Stood up `reference-sdk/py/`: `pyproject.toml` (hatch +
   uv toolchain), `Dockerfile.dev` (`python:3.12-slim`), `compose.yml`,
   `Makefile` (install / build / test / lint / typecheck / check / clean
   targets), `src/eidolons_ecl/{__init__,__main__,version,errors,types}.py`,
   `tests/test_scaffold.py`. **Parent finalised** the `uv.lock`,
   migrated the deprecated `[project.optional-dependencies]` block to
   `[dependency-groups]`, and ran `ruff --fix` to land a clean lint
   baseline.
3. **S2.1 eval framework** (APIVR-Δ subagent). Built `eval/kpi.py`
   (four KPI families: coordination, topology, competition, plan_exec —
   each with a deterministic verdict tier), `eval/report.py` (Markdown
   + JSON renderers, deterministic), `tests/test_eval_kpi.py`,
   `tests/fixtures/star-topology.jsonl`. Subagent **stalled before
   the final test pass**; parent landed the fix — an invalid
   f-string expression in `report.py` (the `pe.ratio` formatting branch
   needed an outer `f"…"` over the conditional) — then drove the
   test suite to green.
4. **S2.5 composition generator** (APIVR-Δ subagent). Built
   `compose_gen/render.py` (`yaml.safe_load` + Jinja2 with
   `trim_blocks=True, lstrip_blocks=True, autoescape=False,
   undefined=StrictUndefined`),
   `compose_gen/templates/composition.md.j2` (full preamble + hand-off
   table + edge notes + anti-patterns prose, all derived from
   `contracts/*.yaml`). Subagent **stalled before writing tests**;
   parent wrote `tests/test_compose_gen.py` (golden-file equality,
   determinism over three renders, synthetic two-contract input, empty
   contracts dir, missing-template-path branch), seeded
   `tests/fixtures/composition.expected.md` by running the actual
   generator code against the real `contracts/` set, and added a
   `# type: ignore[import-untyped]` on the `import yaml` to keep
   `mypy --strict` green (PyYAML ships no type stubs).
5. **Spec bump 1.1 → 1.2** (parent). Mechanical pass: copied
   `spec/ecl-1.1.md` to `spec/ecl-1.2.md` with header bump; updated the
   `spec/ecl.md` symlink target; bumped `ECL_VERSION` to `1.2`; updated
   `.github/workflows/conformance.yml` + `release.yml` references where
   the workflow's `ECL_VERSION matches latest spec file` gate compares
   against the spec filename. No envelope-shape changes (S2.A's stories
   are pure SDK + tooling additions).

## Decisions made

Six **D-P2-N** decisions resolved during SPECTRA's TRANCE pass; carried
forward unchanged through implementation:

- **[DECISION] D-P2-1** — **Version strategy: split.** This PR ships
  v1.2.0 (S2.1 + S2.5, additive); Phase 2.B → v1.2.1 / v1.3.0; Phase
  2.C → v2.0.0 (ISE fields, schema `$id` bump). Rejected "all Phase 2
  → v2.0" (over-prices SDK additions) and "ISE → v1.2" (under-prices
  the `$id` bump trigger from DC-1).
- **[DECISION] D-P2-2** — **Three sub-phases** (2.A foundation, 2.B
  additions, 2.C break). S2.1 + S2.5 cluster naturally in 2.A
  because both want the Python scaffold; isolating them costs
  scaffolding duplication.
- **[DECISION] D-P2-3** — **A2A bridge in subdirectory**
  `reference-sdk/py/src/eidolons_ecl/a2a_bridge/` (not a sibling repo).
  Lock-step versioning + shared types + one container.
- **[DECISION] D-P2-4** — **S2.5 cross-repo: option (b)** — generator
  code in `eidolons-ecl`, invocation in `Rynaro/eidolons` CI via the
  vendored `.pyz` bundle. Rejected auto-merging PR (fragile cross-org
  token) and manual maintainer command (can't satisfy byte-determinism
  acceptance gate).
- **[DECISION] D-P2-5** — **Toolchain:** hatch + uv + pytest + ruff +
  mypy --strict + stdlib zipapp; `python:3.12-slim` base. Rejected the
  setuptools/pip/tox/black/flake8/isort stack (config sprawl), poetry
  (slower resolver, idiosyncratic lockfile), pdm (smaller community),
  pyinstaller (over-engineered for pure-Python scope).
- **[DECISION] D-P2-6** — **Schema `$id` bump to v2.0.0 at Phase 2.C**;
  closes DC-1. Out of scope for this PR — flagged here only because
  D-P2-1's split rationale depends on it.

## Outcomes

- Branch: `feat/v1.2.0-py-sdk-and-composition-gen`.
- Final SHA: at PR head on merge (parent tags v1.2.0 post-merge).
- Stories delivered: **3 / 3** (S2.A.0 scaffold, S2.1 eval, S2.5
  compose-gen). Phase 2.B (S2.2, S2.4) and Phase 2.C (S2.3) remain.
- Tests: **46 passing**, **0 failing**, **0 skipped**.
  Coverage on `eval/kpi.py` exceeds the G-S2.1-Unit threshold of 85%.
- Files: 24 created / modified under `reference-sdk/py/` + spec/workflow
  edits at repo root.
- Container image: `python:3.12-slim` base; ~`make image` produces the
  dev image; bind-mount + `ecl-py-sdk-uv-cache` named volume keep host
  clean. No host-level `__pycache__` / `.venv` / `uv-cache`.
- Determinism gates green: `eval` byte-identical over 3 runs;
  `compose-gen` byte-identical over 3 runs and byte-equal to
  `tests/fixtures/composition.expected.md`.

## Subagent stall observations

Both the S2.1 and S2.5 APIVR-Δ subagents stalled in the **same end-stage
pattern** seen in Phase 1.A:

- **Phase 1.A precedent:** Wave II S2 (`envelopeBuild`) stalled mid-pass;
  Wave III S4 (`handoffEmit`) stalled before writing the helper.
- **Phase 2.A repeat:** S2.1 stalled before the final test pass
  (single invalid f-string blocked the suite); S2.5 stalled before
  writing tests at all.

The **anti-stall protocol triggered parent fallback** successfully in
each case — parent finished the small remaining surface against the
SPECTRA spec rather than re-spawning. Track for future Phase 2.B / 2.C
subagent kickoffs: budget the parent for an end-stage finalisation pass
when working under `model: sonnet` + `isolation: worktree`.

## Follow-ups

- **[ACTION]** Cross-repo PR in `Rynaro/eidolons`: land
  `.github/workflows/composition-drift.yml` + replace
  `methodology/composition.md` with the v1.2.0 generator output +
  vendor the Jinja2 template at `methodology/composition.md.template`.
  Gated on v1.2.0 tag + `.pyz` bundle attached to GH release per
  DECISION-P2-4.
- **[ACTION]** Phase 2.B kickoff: SPECTRA-spec the wave-I parallel
  decomposition for S2.2 (`migrate`) + S2.4 (`a2a_bridge`). Branch
  `feat/v1.2.x-migration-and-a2a`. Reuse this scaffold; no new
  container work.
- **[ACTION]** PyPI release PR for `eidolons-ecl-sdk` package — separate
  from v1.2.0 source tag.
- **[ACTION]** Per-Eidolon `ECL_VERSION` bumps to 1.2 across downstream
  Eidolon repos (cascading, tracked separately — out-of-scope for
  Phase 2 per `.spectra/phase2-scoping.yaml:723`).

## Communication lineage

Read order for a reviewer coming in cold:

1. `reference-sdk/py/README.md` — what the SDK does, CLI + module
   surfaces, 4 KPI families, decisions, installation.
2. This file (`.idg/phase2a-chronicle.md`) — what was built, what
   decisions stuck, what's still open, subagent stall observations.
3. `.spectra/phase2-scoping.md` — the SPECTRA spec everything traces
   back to (six D-P2-N decisions, five stories, three sub-phases).
4. `docs/tech-choice.md` — Phase 0 Option F ground.
5. `.idg/ts-sdk-phase1-chronicle.md` — Phase 1.A precedent for the
   chronicle shape and the subagent stall pattern.

Artefacts handed off alongside this PR:

- This chronicle.
- The PR body (summarises tests / files / gates closed).
- `reference-sdk/py/tests/fixtures/composition.expected.md` — golden
  file seeded by the generator code; the byte-for-byte reference for
  the cross-repo drift check.
