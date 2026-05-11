# ECL TypeScript reference SDK

> **Status: in development (Phase 1 of `harness-roadmap.md`).** API parity
> with `reference-sdk/bash/` is the success criterion. The bash SDK
> remains the canonical reference; this is a port.

API:

- `envelopeBuild(opts) → Envelope` — mirror of `envelope-build.sh`.
- `envelopeVerify(opts) → VerifyResult` — mirror of `envelope-verify.sh`.
- `handoffEmit(opts) → EmitResult` — mirror of `handoff-emit.sh`.
- `traceTail(opts) → AsyncIterable<TraceEvent>` — mirror of `trace-tail.sh`.

## Development

All development happens inside the dev container — never on the host.

```
make image          # build the dev image once
make shell          # interactive shell inside the container
make install        # pnpm install (frozen lockfile)
make build          # tsc + vendor bundle
make test           # vitest run
make check          # install + build + test + lint (CI parity)
```

See `Dockerfile.dev` for the base image (`node:22-bookworm-slim`),
`compose.yml` for the bind-mount, and the project `Makefile` for every
convenience target.

## Distribution (post-merge)

Per `docs/tech-choice.md` (Phase 0):

- npm package — primary distribution.
- Vendor-as-single-file build — secondary, published at each release tag.

The package is at API parity with the bash SDK; the spec version it
targets is declared in a constant (see `src/version.ts` once it lands).
