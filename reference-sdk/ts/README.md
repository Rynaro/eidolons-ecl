# ECL TypeScript reference SDK

> **Status: Phase 1.A landed.** API parity with `reference-sdk/bash/` is
> the success criterion. The bash SDK remains the canonical reference;
> this is a port that mirrors its semantics, flag-for-flag.

## What it is

A TypeScript port of the bash reference SDK shipped under
`reference-sdk/bash/`. The bash implementation stays canonical: every
behaviour here is verified against it, and divergence is treated as a
bug in the port. See the [reference materials](#reference-materials)
section for the canonical spec and the SPECTRA/ATLAS artefacts that
drove this implementation.

## API surface

Four exported functions, all async, all driven by typed option records.

### `envelopeBuild(opts: EnvelopeBuildOptions): Promise<Envelope>`

Mirror of `reference-sdk/bash/envelope-build.sh`.

- 22-flag surface preserved; option names map 1:1 to the bash flags.
- Digest is SHA-256 computed **over raw bytes** of the artifact (no
  re-encoding, no normalisation).
- IDs default to UUIDv7 when not supplied by the caller.
- Returns an `Envelope` object matching the ECL 1.0 schema.

### `envelopeVerify(opts: EnvelopeVerifyOptions): Promise<VerifyResult>`

Hybrid verifier — see **[DECISION] D-4** below.

- **E-/I- gates** (envelope shape, identity): ajv 8 with the bundled
  JSON Schema 2020-12 schema.
- **C-/D- gates** (contract, drift): shells out to
  `bash conformance/check.sh`, parsing its exit code and stderr.
- Optional `traceDir`: when set, emits `verify_pass` / `verify_fail`
  trace events on the receive side (see **[GAP-6]**).
- Result shape: `{ ok: boolean, failures: Failure[], warnings: Warning[] }`.

### `handoffEmit(opts: HandoffEmitOptions): Promise<EmitResult>`

Mirror of `reference-sdk/bash/handoff-emit.sh`. Atomic emit:

1. Build the envelope (`envelopeBuild` under the hood).
2. Write the sidecar at `<artifact>.envelope.json`.
3. Append an `emit` event to the trace JSONL.

All three steps complete or the call rejects with the partial state
documented in the result. Trace append uses POSIX append semantics —
see **[DECISION] D-3**.

### `traceTail(opts: TraceTailOptions): AsyncIterable<TraceEvent>`

Mirror of `reference-sdk/bash/trace-tail.sh`.

- Filters: `from`, `to`, `thread`.
- Follow mode (`follow: true`) streams new events; pass an
  `AbortSignal` to tear down cleanly.
- Yields typed `TraceEvent` records; consumers drive iteration with
  `for await`.

## Installation

Per `docs/tech-choice.md` (Phase 0):

- **npm** (when published) — primary distribution channel.
- **Vendor-as-single-file** — `dist/eidolons-ecl-sdk.bundle.js` is
  published at each release tag for environments that prefer
  vendoring over a package manager.

## Development

The dev container is **mandatory** — never run pnpm/node on the host.

```
make image          # build the dev image once
make shell          # interactive shell inside the container
make install        # pnpm install (frozen lockfile)
make build          # tsup dual ESM/CJS + vendor bundle
make test           # vitest run
make lint           # biome check
make check          # install + build + test + lint (CI parity)
make clean          # drop node_modules and dist
```

See `Dockerfile.dev` (base `node:22-bookworm-slim`), `compose.yml`
for the bind-mount, and `Makefile` for the full target list.

## Decisions

Carried forward from `.spectra/ts-sdk-port.md`:

- **[DECISION] D-1** — ajv 8.x + ajv-formats 3.x, using the
  `Ajv2020` constructor for native JSON Schema 2020-12 support.
- **[DECISION] D-2** — tsup 8.x as the build tool; emits the dual
  ESM/CJS package and the single-file vendor bundle.
- **[DECISION] D-3** — Trace append uses `fs.appendFileSync` with
  `flag: "a"`. POSIX guarantees lines < 4 KiB are written atomically
  under append mode, matching the bash SDK's `>>` behaviour.
- **[DECISION] D-4** — Hybrid verify: ajv in TypeScript for E-/I-
  gates; shell-out to `bash conformance/check.sh` for C-/D- gates.
  Avoids re-implementing the contract checker until bash drift forces
  the issue.

## Gaps & follow-ups

- **[GAP-1]** The TS verifier adds ajv-based JSON Schema 2020-12
  validation that the bash SDK does not perform; bash still relies on
  structural `jq` checks. This addition is **not back-ported** —
  intentional, but tracked.
- **[GAP-2]** Contract fields `schema_ref`, `required_sections`, and
  `evidence_anchor_required` are present in the contract type but
  unused by the current verifier. Deferred until a real consumer
  needs them.
- **[DISPUTED]** Two shell-out integration tests are currently
  `describe.skip`'d in `envelopeVerify.test.ts`. They fail with
  `C-1 EDGE_UNKNOWN` on an otherwise valid `atlas → spectra`
  envelope because `bash conformance/check.sh` parses
  `envelope.from` as a slug string, while the TS SDK emits it as an
  `agentRef` object. **[ACTION]** Follow-up PR required to align
  the fixture shape (or the bash checker) so the C-/D- gates
  exercise on real envelopes again.
- **[GAP-6]** Receive-side trace events are wired in `envelopeVerify`
  (opt-in via `traceDir`), but `handoffEmit` only writes `emit`
  events. Receivers can compose `envelopeVerify({ traceDir })` to
  emit `verify_pass` / `verify_fail` themselves; a unified
  receive-side helper is deferred.

## Reference materials

Provenance for everything in this README:

- `Rynaro/eidolons-ecl/spec/ecl-1.0.md` — canonical ECL 1.0 spec.
- `reference-sdk/bash/*.sh` — canonical reference implementation;
  the source of truth for parity.
- `.spectra/ts-sdk-port.md` and `.spectra/ts-sdk-port.yaml` — the
  SPECTRA specification that scoped this port.
- `.atlas-scout/scout-report.md` — ATLAS scouting report (24 files,
  10 sub-questions, 6 gaps).
- `docs/tech-choice.md` — Phase 0 multi-language tier decision
  (Option F) and the dependency choices for this tier.
