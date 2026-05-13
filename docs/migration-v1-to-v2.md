# ECL v1.x → v2.0 migration guide

**Spec:** ECL v2.0 | **Date:** 2026-05-13

This guide covers what changes between ECL v1.x (v1.0, v1.1, v1.2) and
ECL v2.0, and what existing emitters and receivers need to do.

---

## TL;DR — what changed

| Area | v1.x | v2.0 |
|---|---|---|
| `envelope_version` | `"1.0"`, `"1.1"`, or `"1.2"` | `"2.0"` (default in SDKs) |
| `artifact.schema_version` | `"1.0"` | `"2.0"` (default in SDKs) |
| ISE block (`ise`) | not present | OPTIONAL; when present, `assertion_grade` is required |
| Schema `$id` URI | `/v1.0.0/` segment | `/v2.0.0/` segment |
| `envelope.v2.json` | not present | added; v2.x envelopes validate against it |
| Conformance gate E-3 | accepted `1.0` only | accepts `1.0`, `1.1`, `1.2`, and `2.0` |
| Conformance gate E-3.compat | not present | INFO gate emitted when v1.x accepted under v2.0 verifier |
| Conformance gates S-1, S-2, S-3 | not present | S-1 MUST (ISE shape), S-2 MUST (ISE authz), S-3 SHOULD (ISE at high trust) |
| Conformance checker version | `1.0.0` | `2.0.0` |

---

## Breaking changes

### 1. Schema `$id` URI segment changed

All 12 schema `$id` values changed from `/v1.0.0/` to `/v2.0.0/`.

**Impact:** If your tooling loads schemas by `$id` URI (e.g. ajv, jsonschema),
update your import paths:

```
Before: https://eidolons.dev/schemas/v1.0.0/schemas/envelope.v1.json
After:  https://eidolons.dev/schemas/v2.0.0/schemas/envelope.v1.json
```

The **TS SDK** handles this transparently — `buildAjv()` loads both
`envelope.v1.json` and `envelope.v2.json` and dispatches by `envelope_version`.
No consumer code change is needed if you use `envelopeVerify()`.

### 2. `envelopeVerify` now requires `envelope.v2.json` in the schemas directory

The TS `envelopeVerify` loads `envelope.v2.json` alongside `envelope.v1.json`.
When `envelope.v2.json` is absent (older install), it falls back to validating
all envelopes against `envelope.v1.json` (no ISE validation). This is safe but
S-1 and S-2 gates will not fire.

**Action:** Ensure your schemas directory includes the new `envelope.v2.json`
after updating to the v2.0 SDK.

---

## Non-breaking additions (opt-in)

### ISE trust-hierarchy block

The `ise` field is OPTIONAL. Existing envelopes without `ise` remain valid.

To add ISE to a new envelope:

```json
{
  "envelope_version": "2.0",
  ...
  "ise": {
    "assertion_grade": "self-attested",
    "provenance": {
      "methodology_version": "atlas-1.4.2",
      "tool_surface": ["Read", "Bash"]
    },
    "receiver_authorization": {
      "auto_route": true,
      "auto_merge": false,
      "auto_deploy": false
    }
  },
  ...
}
```

`assertion_grade` is the only required field inside `ise`. Valid values:
`"unverified"`, `"self-attested"`, `"validated"`, `"human-reviewed"`.

### New conformance gates

| Gate | Level | Condition |
|---|---|---|
| S-1 | MUST | `ise` present but `assertion_grade` absent → fails |
| S-2 | MUST | `ise.receiver_authorization` values are valid booleans |
| S-3 | SHOULD | `trust_level=high` + `ise` absent → warn |

S-3 is warn-only (SHOULD) at v2.0. PROMOTION-CANDIDATE to MUST at v2.1.

---

## SDK migration

### TypeScript SDK

```typescript
// Before (v1.x): envelope_version was "1.0"
const env = await envelopeBuild({ ... });
// env.envelope_version === "1.0"  ← was

// After (v2.0): defaults to "2.0"
const env = await envelopeBuild({ ... });
// env.envelope_version === "2.0"  ← now

// With ISE:
const envWithIse = await envelopeBuild({
  ...,
  ise: {
    assertion_grade: "self-attested",
    provenance: { methodology_version: "atlas-1.4.2" },
  },
});
```

`ECL_VERSION_TARGET` is now `"2.0"` (was `"1.1"`).

### Python SDK

```python
from eidolons_ecl.version import ECL_VERSION_TARGET
# ECL_VERSION_TARGET == "2.0"  ← now (was "1.2")

from eidolons_ecl.types import IseBlock, Envelope
# IseBlock, IseProvenance, IseReceiverAuthorization are now available.
```

`Envelope` TypedDict now has `ise: NotRequired[IseBlock]`.

### Bash SDK

```bash
# Before: envelope_version defaults to "1.0"
bash envelope-build.sh --artifact foo.md --contract c.yaml \
  --performative PROPOSE --objective "..."
# jq output: "envelope_version": "1.0"  ← was

# After: envelope_version defaults to "2.0"
# No flag change needed for the default case.

# With ISE:
bash envelope-build.sh --artifact foo.md --contract c.yaml \
  --performative PROPOSE --objective "..." \
  --ise '{"assertion_grade":"self-attested"}'
```

---

## Receiver compatibility (§7.3 compat window)

v2.0 receivers **SHALL** accept v1.x envelopes through **2027-05-13**
(12-month window from v2.0 release). The conformance checker emits an
E-3.compat INFO gate (not a failure) when a v1.x envelope is verified.

No action is required on existing v1.x emitters unless they want to
adopt ISE or the new `envelope_version: "2.0"` default. Both changes
are additive.

---

## Validation tooling

The conformance checker is at `conformance/check.sh`. Version 2.0.0:

```bash
bash conformance/check.sh path/to/.eidolons
bash conformance/check.sh path/to/scout-report.envelope.json
bash conformance/check.sh path/to/.eidolons --json
```

Gate set additions in v2.0:
- E-3 regex now accepts `1.0|1.1|1.2|2.0` (fixes latent v1.1/v1.2 rejection).
- E-3.compat INFO when v1.x accepted under v2.0 receiver.
- S-1, S-2, S-3 (ISE gates — see conformance/lib/ise.sh).

---

## Changelog reference

See `CHANGELOG.md §[2.0.0]` for the full change list.
