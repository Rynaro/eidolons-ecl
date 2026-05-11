# ECL Python reference SDK

> **Status: Phase 2.A scaffold (S2.A.0).** Container skeleton and package
> skeleton only. Eval framework (S2.1) and composition generator (S2.5)
> land in subsequent stories on the same branch.

## What it is

The Python tier of the ECL multi-language harness (see `docs/tech-choice.md`
Option F). The bash SDK remains the canonical reference; this tier adds
the eval framework (MultiAgentBench-style KPIs) and the composition
generator. Per `docs/tech-choice.md:42-45`, minor versions move
lock-step with the spec; patch versions per SDK may differ.

## Planned module surface

| Module | Story | Status |
|---|---|---|
| `envelope` | S2.A.0 | types + errors scaffold |
| `eval` | S2.1 | not yet landed |
| `migrate` | S2.2 (Phase 2.B) | not yet landed |
| `a2a_bridge` | S2.4 (Phase 2.B) | not yet landed |
| `compose_gen` | S2.5 | not yet landed |

## Distribution

Per `docs/tech-choice.md` D-PHASE0-2:

- **pip** — `pip install eidolons-ecl-sdk` (PyPI; separate release PR).
- **Vendor single-file** — `dist/eidolons-ecl-sdk.bundle.pyz` attached to
  each GH release; used by `Rynaro/eidolons` CI without a pip install
  (per DECISION-P2-4 in `.spectra/phase2-scoping.yaml`).

## Development

The dev container is **mandatory** — never run uv/pytest/mypy on the host.

```
make image          # build the dev image once
make shell          # interactive shell inside the container
make install        # uv sync (install deps from lockfile)
make build          # uv build (wheel + sdist) + zipapp vendor bundle
make test           # uv run pytest
make lint           # ruff check + ruff format --check
make typecheck      # mypy strict on src/
make check          # install + build + test + lint + typecheck (CI parity)
make clean          # drop container, image, and named uv-cache volume
```

See `Dockerfile.dev` (base `python:3.12-slim`), `compose.yml` for the
bind-mount layout, and `Makefile` for the full target list.

## License

Apache-2.0 — consistent with `docs/tech-choice.md` D-PHASE0-4 and the
rest of the `eidolons-ecl` tree.
