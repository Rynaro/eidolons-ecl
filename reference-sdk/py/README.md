# ECL Python reference SDK

> **Status: Phase 2.A landed (ECL v1.2.0).** Python tier of the
> multi-language harness. Targets ECL spec **v1.2**. Container-first
> development; the host never runs `uv`, `pytest`, `ruff`, or `mypy`
> directly.

## What it is

The Python tier of the ECL multi-language harness (see `docs/tech-choice.md`
Option F). **This is not a port of the bash SDK.** The bash SDK at
`reference-sdk/bash/` remains the canonical reference for `envelopeBuild` /
`envelopeVerify` / `handoffEmit` / `traceTail`; the TS SDK at
`reference-sdk/ts/` ports that surface to host-language consumers.

The Python tier hosts capabilities that don't make sense in bash or TS:

- **`eidolons-ecl eval`** — KPI computation over JSONL trace files. Story
  S2.1. Reads `<trace-dir>/<thread_id>.jsonl` files, emits Markdown or
  JSON KPI reports.
- **`eidolons-ecl compose-gen`** — regenerates `methodology/composition.md`
  in the nexus repo (`Rynaro/eidolons`) from `contracts/*.yaml` in this
  repo. Story S2.5. Byte-deterministic.

**Planned for Phase 2.B (v1.2.1 / v1.3.0):** `migrate` (S2.2 — back-fill
v1.x envelopes for legacy artefacts), `a2a-card` and `a2a-translate` (S2.4
— A2A bridge, read-only).

Per `docs/tech-choice.md:42-45`, SDK MINOR versions move lock-step with the
spec; PATCH versions per SDK MAY differ.

## CLI surface

```
eidolons-ecl --version
eidolons-ecl eval         --trace-dir <dir> [--thread <id>] [--out <md>] [--out-json <json>]
eidolons-ecl migrate      --root <dir>                                    # NotImplementedError (S2.2)
eidolons-ecl a2a-card     --roster <path> [--out <json>]                  # NotImplementedError (S2.4)
eidolons-ecl a2a-translate --message <a2a.json> [--out <env.json>]        # NotImplementedError (S2.4)
eidolons-ecl compose-gen  --contracts <dir> --template <path> [--out <md>]
```

The CLI is also reachable as `python -m eidolons_ecl`. Stubs registered
for Phase 2.B subcommands raise `NotImplementedError` with the story
label so callers see the unimplemented path clearly.

## Module surface

The package is `eidolons_ecl`. Stable public symbols at v1.2.0:

| Symbol | Module | Stability | Role |
|---|---|---|---|
| `ECL_VERSION_TARGET` | `eidolons_ecl.version` | stable | string `"1.2"` — spec minor this SDK targets |
| `__version__` | `eidolons_ecl.version` | stable | string `"1.2.0"` — SDK SemVer |
| `EclError` | `eidolons_ecl.errors` | stable | structured error type with `code`, `gate`, `phase`, cause chaining |
| `evaluate_thread(trace_dir, thread_id=None)` | `eidolons_ecl.eval` | stable | returns `list[KpiReport]` per JSONL file in `trace_dir` |
| `render_markdown(report)` | `eidolons_ecl.eval.report` | stable | KpiReport → Markdown string |
| `render_json(report)` | `eidolons_ecl.eval.report` | stable | KpiReport → JSON string (sorted keys) |
| `render_composition(contracts_dir, template_path)` | `eidolons_ecl.compose_gen` | stable | contracts + Jinja2 template → composition.md string |

`EclError` carries a `code` discriminant (`SCHEMA_MISMATCH`, `INTEGRITY_FAIL`,
`PERFORMATIVE_NOT_ALLOWED`, `EDGE_UNKNOWN`, `ARTIFACT_KIND_NOT_ALLOWED`,
`BUDGET_EXCEEDED`, `MISSING_SECTION`, `ANCHOR_REQUIRED`, plus SDK-internal
codes `USAGE`, `INTEGRITY_COMPUTE_FAILED`, `IO_FAILED`, `NOT_IMPLEMENTED`),
mirroring ECL §5.3 plus SDK-internal codes for programming/I-O errors.

Typed schemas (`Envelope`, `Performative`, `AgentRef`, `Contract`,
`TraceEvent` and friends) live in `eidolons_ecl.types`. They are
hand-derived `TypedDict`s synced to `schemas/envelope.v1.json` and friends;
codegen is deferred.

## KPI families (`eval`)

`evaluate_thread` produces a `KpiReport` per thread with four KPI
families. Each family has a deterministic verdict tier:

| Family | Module symbol | Metrics | Verdict tiers |
|---|---|---|---|
| **Coordination quality** | `CoordinationKpis` | `decisions_per_envelope_ratio`, `refuse_rate`, `escalate_rate` | `good` (escalate <0.10 AND refuse <0.05) / `warn` (in-between) / `poor` (escalate >0.30 OR refuse >0.20) |
| **Topology efficacy** | `TopologyKpis` | `topology`, `hub_eidolon`, `branch_count`, `cycle_detected` | `chain` (linear) / `star` (one node ≥3 distinct senders) / `graph` (DAG with branches) / `degenerate` (cycle present) |
| **Competition resilience** | `CompetitionKpis` | `critique_count`, `total_envelopes`, `critique_fraction` | `low` (<0.10) / `moderate` (0.10–0.30) / `strong` (>0.30) |
| **Planning vs execution divergence** | `PlanExecKpis` | `spectra_propose_count`, `apivr_escalate_count`, `ratio` | `aligned` (ratio <0.50) / `divergent` (ratio ≥0.50) / `n/a` (no SPECTRA proposes) |

**Interpretation** — `good` / `low` / `aligned` / `chain` are the
no-friction baselines for a healthy thread. `poor` / `strong` / `divergent`
/ `degenerate` are escalation signals: the thread spent itself in
refusals, criticism, escalation churn, or cycles. `star` is neutral —
it's the normal shape for a coordinator/orchestrator pattern.

Only `event: "emit"` records contribute to KPIs; `receive` / `verify_pass`
/ `verify_fail` events are treated as metadata.

## Determinism guarantee

Both `eval` and `compose-gen` produce **byte-deterministic** output on
identical input.

- **`eval`** — JSONL parsing is order-preserving; sets are sorted before
  emission; dict serialization uses `json.dumps(..., sort_keys=True)`;
  no timestamps in output. Three runs of `evaluate_thread + render_*` on
  the same `trace_dir` produce identical byte strings (gate G-S2.1-Determinism).
- **`compose-gen`** — contract files are discovered via `sorted(p for p
  in contracts_dir.iterdir() if p.suffix == ".yaml")` (matches `LC_ALL=C`
  for ASCII filenames); YAML parsing uses `yaml.safe_load` (PEP 468 dict
  insertion order); Jinja2 is configured with `trim_blocks=True,
  lstrip_blocks=True, autoescape=False, undefined=StrictUndefined`; no
  timestamps, no random IDs, no hostnames in output (gate
  G-S2.5-Determinism + G-S2.5-Golden-File).

The golden-file fixture `tests/fixtures/composition.expected.md` is the
byte-for-byte reference; regenerated output that differs fails CI.

## Installation

Per `docs/tech-choice.md` D-PHASE0-2:

- **pip** (eventual) — `pip install eidolons-ecl-sdk`. A separate release
  PR will publish to PyPI; not part of v1.2.0.
- **Vendor single-file** — `dist/eidolons-ecl-sdk.bundle.pyz` produced by
  `make build` (stdlib `zipapp`); attached to each GH release. The nexus
  repo (`Rynaro/eidolons`) consumes the vendored bundle in CI per
  DECISION-P2-4 (no pip dependency on a Python package from a bash-CLI repo).

## Development

The dev container is **mandatory** — never run `uv` / `pytest` / `ruff` /
`mypy` on the host.

```
make image          # build the dev image once
make shell          # interactive shell inside the container
make install        # uv sync --frozen (install deps from lockfile)
make build          # uv build (wheel + sdist) + zipapp vendor bundle
make test           # uv run pytest
make lint           # ruff check + ruff format --check
make typecheck      # mypy --strict on src/
make check          # install + build + test + lint + typecheck (CI parity)
make clean          # drop container, image, and named uv-cache volume
```

Base image: `python:3.12-slim`. Named volume `ecl-py-sdk-uv-cache`
warms `uv` resolution between runs. Host pollution (host `python` /
`pip` / `uv` / `pytest` / `ruff` / `mypy`) is forbidden per the
container constraint in `.spectra/phase2-scoping.yaml`.

## Decisions

Carried from `.spectra/phase2-scoping.md`:

- **[DECISION] D-P2-1** — Version strategy: split. This PR ships **v1.2.0**
  (S2.1 + S2.5 — additive SDK + tooling; no spec/schema shape change).
  Phase 2.B ships v1.2.1 / v1.3.0; Phase 2.C ships v2.0.0 with ISE fields.
  Per ECL §7.1 SemVer: pure additions → MINOR.
- **[DECISION] D-P2-3** — A2A bridge lives at
  `reference-sdk/py/src/eidolons_ecl/a2a_bridge/` (subdirectory, **not**
  a sibling repo). Lock-step versioning + shared types + one container
  cover both the SDK and the A2A bridge.
- **[DECISION] D-P2-5** — Python toolchain: `hatch` (build backend
  `hatchling`) + `uv` (resolver + lockfile) + `pytest` + `ruff` (lint +
  format) + `mypy --strict` + stdlib `zipapp` for the vendor bundle.
  Container base `python:3.12-slim`.

## Gaps & follow-ups

- **[GAP]** No Python port of `envelopeBuild` / `envelopeVerify` /
  `handoffEmit` / `traceTail` in v1.2. The Python tier exists for eval +
  tooling, not host integrations — those stay in TS (`reference-sdk/ts/`)
  and bash (`reference-sdk/bash/`). Re-evaluate for v1.3+ if a real
  Python consumer needs the host-integration surface.
- **[ACTION]** Phase 2.B (v1.2.1 / v1.3.0) will add `migrate` (S2.2) and
  `a2a_bridge` (S2.4). Branch convention:
  `feat/v1.2.x-migration-and-a2a`.
- **[ACTION]** Schema `$id` bump from v1.0.0 to v2.0.0 deferred to Phase
  2.C / v2.0 per drift candidate DC-1 (`docs/drift-register.md`). The ISE
  trust-hierarchy fields land at the same v2.0 boundary.
- **[ACTION]** Cross-repo `methodology/composition.md` regeneration and
  the `composition-drift.yml` workflow in `Rynaro/eidolons` land as a
  separate follow-up PR after the v1.2.0 tag publishes (per
  DECISION-P2-4 acceptance criteria).
- **[ACTION]** PyPI publish for `eidolons-ecl-sdk` deferred to its own
  release PR after v1.2.0 tag.

## Reference materials

Provenance for everything in this README:

- `Rynaro/eidolons-ecl/spec/ecl-1.2.md` — ECL spec v1.2 (target).
- `.spectra/phase2-scoping.md` + `.spectra/phase2-scoping.yaml` — the
  SPECTRA G3 evaluator-optimizer pass (confidence 0.90, 1 Refine cycle)
  that scoped Phase 2.A / 2.B / 2.C and the six D-P2-N decisions.
- `Rynaro/eidolons/.spectra/harness-roadmap.md` §"Phase 2 — ECL v2.0" —
  the parent roadmap entry (note: scoped to v1.2 / v1.2.x / v2.0 split
  per D-P2-1, not all-v2.0 as the heading reads).
- `docs/tech-choice.md` — Phase 0 multi-language tier decision (Option
  F, committed 2026-05-11). Source of D-PHASE0-1 (subdirectory layout),
  D-PHASE0-2 (pip + vendor distribution), D-PHASE0-3 (lock-step
  versioning), D-PHASE0-4 (Apache-2.0 licensing).
- `reference-sdk/ts/README.md` — Phase 1.A TS SDK precedent for the
  README shape, container-first posture, and provenance discipline.
- `.idg/phase2a-chronicle.md` — chronicle of the Phase 2.A build pass
  (this PR's companion documentation artefact).

## License

Apache-2.0 — consistent with `docs/tech-choice.md` D-PHASE0-4 and the
rest of the `eidolons-ecl` tree.
