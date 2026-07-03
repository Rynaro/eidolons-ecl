# Schemas

JSON Schema 2020-12 definitions backing ECL v2.0 (and v1.x via §7.3 compat window),
plus the ECL v2.1 (Draft) envelope schema.

## v2.1 schemas (Draft, adoption-gated)

| File | Spec section | Purpose |
|---|---|---|
| `envelope.v2.1.json` | §1, §6.5.8 | The sidecar envelope at v2.1 (Draft). Carries `envelope.v2.json` forward, adds the optional `ise.verification` sub-block (gate S-4), and widens the `envelope_version` pattern to `^(1\.[012]\|2\.[01])(\.\d+)?$`. `envelope.v2.json` is left untouched; validators pick the schema by `envelope_version`. |

## v2.0 schemas

| File | Spec section | Purpose |
|---|---|---|
| `envelope.v2.json` | §1, §6.5 | The sidecar envelope at v2.0. Adds the optional `ise` trust-hierarchy block and widens `envelope_version` pattern to `^(1\.[012]\|2\.0)(\.\d+)?$`. |

## v1.x schemas (retained per §7.3 compatibility window)

| File | Spec section | Purpose |
|---|---|---|
| `envelope.v1.json` | §1 | The sidecar envelope written next to every emitted artefact. |
| `performative.v1.json` | §2 | Closed enum of the ten performatives. Referenced by other schemas. |
| `handoff-contract.v1.json` | §3 | Validates the YAML records under `contracts/`. |
| `context-delta.v1.json` | §4 | Embedded `context_delta` object inside an envelope. |
| `handoff-event.v1.json` | §5 | One trace event line in `.eidolons/.trace/<thread_id>.jsonl`. |
| `per-eidolon/_base-profile.v1.json` | §3.1 | Shared frontmatter base. |
| `per-eidolon/<kind>.v1.json` | §3.1 | Kind-specific frontmatter profile. |

All schema `$id` URI path segments were bumped from `/v1.0.0/` to `/v2.0.0/` at v2.0.
File names are intentionally unchanged (`*.v1.json` filenames remain) — the `$id` path
segment is the versioned identifier that ajv resolves, not the filename.

## Local validation

```bash
jq empty schemas/*.json schemas/per-eidolon/*.json
```

Schemas use `$ref` for cross-references; resolvers MUST treat the relative
paths as resolved against this directory.
