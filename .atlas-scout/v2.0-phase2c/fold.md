# Fold — compressed working memory

## Decision-loadbearing facts

- Phase 2.C is **envelope-only**; contracts/performatives/events
  stay at v1 (`.spectra/phase2-scoping.md:210`). New file:
  `schemas/envelope.v2.json`. The other 11 schema `$id`s also bump
  to `/v2.0.0/` per the [DECISION-P2-6] discipline (lines 191-194)
  even though those schemas' bodies are unchanged — this is the DC-1
  closure, not a content change.
- Filename convention: `*.v1.json` and `*.v2.json` co-exist; ajv
  resolves by `$id`, but external vendors clone by filename
  (scoping doc lines 197-208).
- ISE is OPTIONAL & MAY-ignore at receive (scoping line 231). v1.x
  receivers stay valid. v2.0 receivers MAY apply hierarchy.
- §1.1.1 regex moves `^1\.[012](\.\d+)?$` → `^[12]\.\d+(\.\d+)?$`
  (line 520).
- Three live bash sites are **already stale** (E-3 says v1.0 only;
  README says v1.2). Latent drift to be acknowledged in PR.

## Critical hardcode inventory (must edit)

| File | Line(s) | Current | At v2.0 |
|---|---|---|---|
| `ECL_VERSION` | top | `1.2` | `2.0` |
| `SPEC.md` symlink | n/a | → `spec/ecl-1.2.md` | → `spec/ecl-2.0.md` |
| `conformance/lib/envelope.sh` | 38-40 | `1.0\|1.0.*` | add 1.1/1.2/2.0 |
| `conformance/check.sh` | 25,39,131,134-141 | v1.0 baseline | v2.0 baseline + accept v1.x |
| `reference-sdk/ts/src/version.ts` | 11 | `"1.1"` | `"2.0"` (was lagging) |
| `reference-sdk/ts/src/envelopeVerify.ts` | 112-119,168 | enumerates v1 only | add envelope.v2.json |
| `reference-sdk/ts/src/envelopeBuild.ts` | 208,219 | `"1.0"` literals | parameterise or branch on `ise` |
| `reference-sdk/py/src/eidolons_ecl/version.py` | 8-9 | `1.2.0`/`"1.2"` | `2.0.0`/`"2.0"` |
| `reference-sdk/py/src/eidolons_ecl/types.py` | 147 | `^1\\.0(...)?$` docstring | `^[12]\\.\\d+(\\.\\d+)?$` |
| `reference-sdk/py/src/.../migrate/backfill.py` | 63 | `"1.0"` | DECIDE (GAP-C) |
| `reference-sdk/py/src/.../a2a_bridge/translator.py` | 205 | `_ENVELOPE_VERSION` | DECIDE (GAP-C) |
| `reference-sdk/bash/envelope-build.sh` | 191,203 | `"1.0"` literals | parameterise + ise flag |
| `.github/workflows/conformance.yml` | 43-50 | spec/ecl-1.2.md | spec/ecl-2.0.md |
| `.github/workflows/release.yml` | 51-53 | adds 1.0/1.1/1.2 | add 2.0 |
| `schemas/README.md` | top | "v1.0" prose | v1+v2 table |
| `docs/drift-register.md` | 170-191; 240-244 | DC-1 open candidate | D-01 promoted; entry in Historical |

## Open unknowns for SPECTRA

- **GAP-A:** contract schema bump or not? Currently scoped envelope-only.
  Does S2.3 want per-edge `default_ise` declared in contracts?
- **GAP-B:** Phase 2.C also lands a Python envelope verifier, or stays
  on TS+bash only? (Current py SDK has no verifier — see FINDING-016.)
- **GAP-C:** Does the migrate backfill tool start emitting v2 envelopes,
  or stay backward (v1.0)? Same for a2a-bridge translator.
- **GAP-D:** Is DC-3 (TS↔bash from-field shape) bundled into the v2.0 PR,
  or deferred? It is already overdue (target was pre-v1.2.0).
- **GAP-E:** Concrete ISE field set & SHALL-level receiver semantics.
  Mission constraint explicitly defers this to SPECTRA. Scoping doc
  lines 216-228 propose a shape but it is non-binding.
- **GAP-F:** Does `templates/envelope-v2-example.json` ship at Phase 2.C?

## What I did NOT propose

- ISE field names, types, or shapes — that is SPECTRA's S2.3 deliverable.
- Conformance gate IDs for new ISE gates — natural namespace is `S-*`
  (semantic / segment) but the actual IDs are SPECTRA's call.
- PR boundaries (one PR or split across schema/spec/SDKs) — SPECTRA
  decision; phase2-scoping.md prefers a single `feat/v2.0.0-ise-fields`
  branch (line 514).
