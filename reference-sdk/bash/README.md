# Bash reference SDK

Four small scripts that emit and inspect ECL v1.0 envelopes. They are
**reference implementations**: production callers MAY use them, MAY copy
them and modify, or MAY reimplement against the spec directly.

| Script | Purpose |
|---|---|
| `envelope-build.sh` | Build a v1.0 envelope JSON from an artifact + a contract. Emits to stdout. |
| `envelope-verify.sh` | Verify an envelope (thin wrapper over `conformance/check.sh`). |
| `handoff-emit.sh` | Atomic emit: write envelope sidecar + append a trace event. |
| `trace-tail.sh` | Tail a thread trace JSONL with optional filters. |

## Hard requirements

- `bash` 3.2+
- `jq`
- `shasum` or `sha256sum`
- `uuidgen` (RECOMMENDED) or `od /dev/urandom` (fallback)
- `yq` OR `python3` with `yaml` for YAML contract parsing

## Optional

- `openssl` — required when `--integrity-method hmac-sha256` is requested.

## Examples

Build → verify round-trip:

```bash
bash envelope-build.sh \
  --artifact ./scout-report.md \
  --contract ../../contracts/atlas-to-spectra.yaml \
  --performative PROPOSE \
  --objective "Hand off scout for spec authoring" \
  --from-version 1.4.2 \
  --to-version 4.2.11 \
  --tokens-used 320 \
  --summary "..." \
  > scout-report.md.envelope.json

bash envelope-verify.sh --envelope scout-report.md.envelope.json
```

Atomic emit + trace:

```bash
bash handoff-emit.sh \
  --artifact ./scout-report.md \
  --contract ../../contracts/atlas-to-spectra.yaml \
  --performative PROPOSE \
  --objective "..." \
  --from-version 1.4.2 \
  --to-version 4.2.11 \
  --trace-dir ./.eidolons/.trace
```

Inspect the trace:

```bash
bash trace-tail.sh --trace-dir ./.eidolons/.trace --to vigil --follow
```

## Environment variables

- `ECL_HOST` — default value for `trace.host`. Overridden by `--host`.
- `ECL_MODEL` — default value for `trace.model`. Overridden by `--model`.
- `ECL_HMAC_KEY` — required when integrity method is `hmac-sha256`.

## Design choices

- **Reference, not normative.** The spec defines the envelope and gates.
  These scripts are convenient defaults; nothing breaks if a different
  emitter produces equivalent output.
- **Bash 3.2 floor.** macOS ships bash 3.2, and emit logic frequently runs
  in installer scripts. No `declare -A`, no `mapfile`, etc.
- **Single-file per script.** Easier to vendor.
- **Side effects are explicit.** `envelope-build.sh` emits to stdout only.
  `handoff-emit.sh` is the only script that writes files; it documents the
  exact files in its `--help`.
