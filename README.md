# ECL — Eidolons Communication Layer

ECL is the wire-format and hand-off contract every Eidolon emits and consumes
when collaborating with another Eidolon. It is a plain-text standard plus a
standalone bash conformance checker. The Eidolons nexus
(`Rynaro/eidolons`) and every shipped Eidolon (ATLAS, SPECTRA, APIVR-Δ, IDG,
FORGE, VIGIL) compose against this contract.

- **Latest stable:** [ECL v2.0](spec/ecl-2.0.md) (also reachable as
  [`SPEC.md`](SPEC.md), the symlink to the latest stable spec).
  Archives: [`spec/ecl-1.2.md`](spec/ecl-1.2.md),
  [`spec/ecl-1.1.md`](spec/ecl-1.1.md), [`spec/ecl-1.0.md`](spec/ecl-1.0.md).
  v2.0 receivers SHALL accept v1.x envelopes through 2027-05-13 (§7.3
  compatibility window).
- **Envelope schemas:** [`schemas/envelope.v2.json`](schemas/envelope.v2.json)
  (v2.x, adds optional `ise` block),
  [`schemas/envelope.v1.json`](schemas/envelope.v1.json) (v1.x, retained).
- **Performative enum:** [`schemas/performative.v1.json`](schemas/performative.v1.json).
- **Hand-off contracts:** [`contracts/`](contracts/).
- **Conformance checker:** [`conformance/check.sh`](conformance/check.sh).
- **Reference SDKs:**
  [bash](reference-sdk/bash/) (canonical),
  [TypeScript](reference-sdk/ts/) (host integration tier, v1.1+),
  [Python](reference-sdk/py/) (eval framework + composition generator, v1.2+;
  envelope verifier deferred to v2.1 per `docs/drift-register.md` D-04).
- **Worked examples:** [`examples/`](examples/) (v1 + v2 sibling envelopes).
- **Migration guide:** [`docs/migration-v1-to-v2.md`](docs/migration-v1-to-v2.md).

## What this repo is

This repo holds:

1. **The normative spec** in [`spec/ecl-2.0.md`](spec/ecl-2.0.md). RFC 8174
   (BCP 14) keywords; numbered §1–§8 sections; one file per minor version.
   Earlier versions kept in-tree (e.g. [`spec/ecl-1.2.md`](spec/ecl-1.2.md),
   [`spec/ecl-1.1.md`](spec/ecl-1.1.md), [`spec/ecl-1.0.md`](spec/ecl-1.0.md))
   for the §7.3 12-month compatibility window.
2. **JSON Schemas** in [`schemas/`](schemas/) for the envelope (v1 and v2),
   performative enum, hand-off contract, context-delta record, and trace
   event. All `$id` URI path segments now resolve under `/v2.0.0/`.
3. **Machine-readable hand-off contracts** in [`contracts/`](contracts/), one
   YAML file per directed edge in the Eidolons hand-off graph (ATLAS→SPECTRA,
   APIVR→VIGIL, etc.). These supersede the prose table in the nexus's
   `methodology/composition.md`.
4. **A standalone bash conformance checker** in [`conformance/`](conformance/)
   that runs against any Eidolon-emitted artefact directory without needing
   the nexus. Gate set at v2.0 includes the new `S-1`/`S-2`/`S-3` ISE gates.
5. **A bash reference SDK** in [`reference-sdk/bash/`](reference-sdk/bash/)
   for building, verifying, emitting, and tailing envelopes (now with
   `--ise` flag at v2.0).
6. **CI workflows** that lint shell scripts, validate the schemas, and run
   the conformance checker against fixture artefacts on every push.

## What this repo is NOT

- It is **not** an Eidolon. It does not get installed into consumer projects.
- It does **not** define the methodology content of any Eidolon. That lives
  in each Eidolon's own repo.
- It does **not** define a runtime engine. ECL is a specification + validator;
  the host LLM (Claude Code, Cursor, Codex, opencode) remains the runtime.
- It does **not** redefine `EIIS`. That is the install standard. ECL composes
  with EIIS — see [`docs/relationship-to-eiis.md`](docs/relationship-to-eiis.md).
- It does **not** publish to npm/pip/brew. Distribution is `git clone`.

## Quick start — verify a hand-off chain

```bash
git clone https://github.com/Rynaro/eidolons-ecl /tmp/ecl
bash /tmp/ecl/conformance/check.sh /path/to/your/.eidolons
```

If the checker exits 0, your emitted artefacts satisfy ECL v2.0's MUSTs. Exit
code 4 means you pass MUSTs but have grandfathered warnings (expected during
the migration window).

## Quick start — emit a v2 envelope

```bash
bash /tmp/ecl/reference-sdk/bash/envelope-build.sh \
  --artifact ./my-scout-report.md \
  --contract /tmp/ecl/contracts/atlas→spectra.yaml \
  --thread-id "$(uuidgen)" \
  --ise '{"assertion_grade":"self-attested","provenance":{"methodology_version":"atlas-1.4.2"}}' \
  > my-scout-report.envelope.json

bash /tmp/ecl/reference-sdk/bash/envelope-verify.sh \
  --artifact ./my-scout-report.md \
  --envelope ./my-scout-report.envelope.json
```

The `--ise` flag is OPTIONAL — omit it to emit a v2.0 envelope without the
ISE block (still conformant; `S-1` is not-applicable when the block is
absent, but `S-3` will warn if `trust_level=high`).

Exit codes:

- `0` — passes all MUSTs at the declared `ECL_VERSION`.
- `1` — generic failure (missing dir, unreadable files, bad usage).
- `2` — fails one or more MUSTs.
- `3` — passes MUSTs but fails one or more SHOULDs (advisory).
- `4` — passes MUSTs but emits warn-only output for grandfathered drifts.

See [`conformance/README.md`](conformance/README.md) for details.

## Versioning

ECL uses SemVer at the document level. v1.0 is the first stable. The roadmap:

- **v1.1** (additive): TypeScript and Python reference SDKs; threat-model doc;
  HMAC-SHA256 promoted from optional to RECOMMENDED at `trust_level=high`.
- **v1.2** (additive): Python eval framework, composition generator, A2A
  bridge, migration tooling.
- **v2.0** (MAJOR, this release): optional ISE-style trust-hierarchy block
  (`ise.assertion_grade` / `ise.provenance` / `ise.receiver_authorization`);
  schema `$id` URI bump (`/v1.0.0/` → `/v2.0.0/`); new conformance gates
  `S-1` (MUST), `S-2` (MUST), `S-3` (SHOULD). 12-month §7.3 compatibility
  window guarantees v2.0 receivers SHALL accept v1.x envelopes.

See [§7 of the spec](spec/ecl-2.0.md#7--versioning--compatibility) for the
full promotion timeline.

## Relationship to other repos

```
┌──────────────────────────┐
│  EIIS                    │  Layer 1a — the install contract.
│  (Rynaro/eidolons-eiis)  │
└────────────┬─────────────┘
             │ satisfied by
             ▼
┌──────────────────────────┐
│  ECL  (this repo)        │  Layer 1b — the wire-format / hand-off contract.
│  (Rynaro/eidolons-ecl)   │  Composed with EIIS, not a replacement.
└────────────┬─────────────┘
             │ emitted by
             ▼
┌──────────────────────────┐
│  Eidolon repos           │  Layer 2 — ATLAS, SPECTRA, APIVR-Δ, IDG, FORGE,
│  (Rynaro/{ATLAS,…})      │  VIGIL. Each emits artefacts wrapped in ECL
│                          │  envelopes.
└────────────┬─────────────┘
             │ orchestrated by
             ▼
┌──────────────────────────┐
│  Eidolons nexus          │  Layer 3 — Rynaro/eidolons. Vendors a copy of
│  (Rynaro/eidolons)       │  ECL and uses the conformance checker as part
│                          │  of `eidolons sync`.
└────────────┬─────────────┘
             │ installs into
             ▼
┌──────────────────────────┐
│  Consumer project        │  Layer 4 — `eidolons.yaml` + `eidolons.lock` +
│                          │  `.eidolons/<member>/` + emitted envelopes in
│                          │  `.eidolons/.trace/`.
└──────────────────────────┘
```

See [`docs/relationship-to-eiis.md`](docs/relationship-to-eiis.md) and
[`docs/relationship-to-mcp-a2a.md`](docs/relationship-to-mcp-a2a.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: open an issue
first, then a PR against `main`. Spec changes require a SemVer bump and a
new `spec/ecl-X.Y.md` file.

## License

Apache-2.0. See [LICENSE](LICENSE).
