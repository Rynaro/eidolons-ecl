# Schemas

JSON Schema 2020-12 definitions backing ECL v1.0.

| File | Spec section | Purpose |
|---|---|---|
| `envelope.v1.json` | §1 | The sidecar envelope written next to every emitted artefact. |
| `performative.v1.json` | §2 | Closed enum of the ten performatives. Referenced by other schemas. |
| `handoff-contract.v1.json` | §3 | Validates the YAML records under `contracts/`. |
| `context-delta.v1.json` | §4 | Embedded `context_delta` object inside an envelope. |
| `handoff-event.v1.json` | §5 | One trace event line in `.eidolons/.trace/<thread_id>.jsonl`. |
| `per-eidolon/_base-profile.v1.json` | §3.1 | Shared frontmatter base. |
| `per-eidolon/<kind>.v1.json` | §3.1 | Kind-specific frontmatter profile. |

## Local validation

```bash
jq empty schemas/*.json schemas/per-eidolon/*.json
```

Schemas use `$ref` for cross-references; resolvers MUST treat the relative
paths as resolved against this directory.
