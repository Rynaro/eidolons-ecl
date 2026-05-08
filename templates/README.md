# Templates

Copy-paste starters for emitting ECL artefacts.

| File | What it is |
|---|---|
| `envelope-example.json` | Full v1.0 envelope shape with placeholder values. Use as a starting point when the bash SDK isn't desirable. |
| `handoff-event-example.jsonl` | Four trace event lines covering one full emit/receive/verify_pass + the next emit in the thread. |
| `handoff-contract-template.yaml` | Skeleton for a new contract. Copy to `contracts/<from>-to-<to>.yaml`, replace placeholders, validate with `yq eval`. |

The `reference-sdk/bash/` scripts produce envelopes and trace events
programmatically; these templates are for cases where the SDK isn't a
fit (e.g. an alternate-language implementation building from scratch).
