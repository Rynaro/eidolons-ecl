# SPECTRA spec — TypeScript reference SDK port (Phase 1, S1.1)

**Status:** Assemble (confidence 0.88)
**Source scout:** `/Users/henrique/workspace/oss/agents/eidolons-ecl/.atlas-scout/scout-report.md` (24 findings, 6 gaps, 4 decisions reserved)
**Phase 0 ground:** `/Users/henrique/workspace/oss/agents/eidolons-ecl/docs/tech-choice.md` (Option F committed 2026-05-11)
**Roadmap parent:** `/Users/henrique/workspace/oss/agents/eidolons/.spectra/harness-roadmap.md` story S1.1
**Hand-off:** APIVR-Δ TRANCE wave (4 subagents, sonnet, isolation: worktree) against `Rynaro/eidolons-ecl@feat/v1.1.0-ts-sdk`
**Container constraint:** every install / build / test / lint runs INSIDE `reference-sdk/ts/` dev container via `make <target>`. No host-level Node, pnpm, npx, vitest, ajv, or tsc invocations.

---

## CLARIFY

- **WHO**: APIVR-Δ subagent (or 4-way TRANCE wave per §"TRANCE sequencing" below). Model: sonnet. Isolation: worktree. Fresh session per story.
- **WHAT**: port the four bash SDK helpers — `envelope-build.sh`, `envelope-verify.sh`, `handoff-emit.sh`, `trace-tail.sh` — to TypeScript modules under `reference-sdk/ts/src/`. API parity is the success criterion. Bash stays canonical reference; TS is a parallel implementation that must produce byte-equivalent envelope JSON for identical inputs (modulo intentionally-random fields).
- **WHY**: unblocks the host-LLM integration tier (Cursor, Claude Code, VS Code, opencode, Codex) and gives consumers an `npm install` / vendor-as-single-file distribution path without requiring bash on the host (see `docs/tech-choice.md:101-102, 128`).
- **CONSTRAINTS**:
  - Every dependency operation runs inside the dev container at `reference-sdk/ts/{Dockerfile.dev, compose.yml, Makefile}`. The host MUST NOT grow Node / pnpm / npx dependencies. CI parity target: `make check` (install + build + test + lint).
  - **Byte-equivalence**: TS envelope output, fed to bash `conformance/check.sh`, MUST pass every gate. The bash conformance checker remains canonical.
  - **No spec change** in this PR. Schemas, contracts, ECL_VERSION stay at 1.0. The TS SDK is additive.
  - **API parity, not API improvement**: the four functions mirror the bash flag surface 1:1. TS-idiomatic shape (return values instead of stdout, throwing instead of exit codes) is allowed; new options the bash SDK does not have are NOT.
  - **Apache-2.0 license** per `docs/tech-choice.md:46-47`.
  - `package.json` is private (`"private": true`) for this PR; the first npm publish happens in a separate release PR after the four stories merge.

---

## Decisions resolved

### D-1 — ajv major version → **ajv 8.x + ajv-formats 3.x**

- ajv 8.17.x is the current stable major (May 2026). Native JSON Schema 2020-12 support requires ajv 8 (`Ajv2020` export); ajv 6/7 only support draft-07.
- `ajv-formats` 3.x ships the `uuid` and `date-time` formats both schemas rely on (`schemas/envelope.v1.json:28, 156`).
- Compile mode: `addSchema(bundleArray)` with all six schemas pre-loaded by `$id`; resolution is by-`$id`-against-local-bundle, never HTTP (per F-2.4). Use `strict: false, allowMatchingProperties: true` to accommodate the `if/then` clause in `handoff-contract.v1.json:96-101` (F-2.6).
- Rationale: tech-choice names "ajv" without pinning (`docs/tech-choice.md:64, 103`); ajv 8 is the only major that satisfies C5 (JSON Schema 2020-12).

### D-2 — vendor-build tool → **tsup 8.x**

- tsup wraps esbuild with zero config; emits dual ESM + CJS in one command, supports `--minify` and `--treeshake`, and emits a single-file vendor bundle via `tsup --format esm --no-splitting`.
- Alternatives considered: rollup (more config surface for the same output), unbuild (less battle-tested), pure tsc (no single-file bundle).
- The vendor target produces `dist/eidolons-ecl-sdk.bundle.mjs` — a single file consumers can drop into a project without an npm install. This satisfies `docs/tech-choice.md:128` "vendor-as-single-file build".
- Rationale: smallest config-to-output ratio; ESM-first matches Node 22+ ecosystem direction.

### D-3 — trace JSONL atomicity → **POSIX append + per-line write (option a, matches bash)**

- Use `fs.appendFileSync(path, line + "\n", { flag: "a" })` — single `write(2)` syscall under POSIX semantics. For line sizes ≤ `PIPE_BUF` (4 KiB on Linux), concurrent appenders on the same `O_APPEND` fd are guaranteed atomic; trace event lines (typical ≤ 600 bytes) sit well under that ceiling.
- The bash SDK does raw `>>` append with no flock (F-4.5); matching that behaviour preserves cross-SDK semantic parity. Multi-process safety beyond `PIPE_BUF` is out of scope for v1.1 — ECL spec is silent on atomicity and rotation MAY happen after thread close (§5.1.3).
- Rejected: `proper-lockfile` (adds runtime dep + cross-platform behaviour drift on macOS APFS); atomic-write-then-rename (breaks append semantics — would require read-modify-write per event).
- Caller responsibility documented in `src/handoffEmit.ts` jsdoc: lines larger than 4 KiB are not guaranteed atomic across concurrent writers and SHOULD be avoided.

### D-4 — conformance integration → **hybrid (c) — ajv in TS for E- / I- gates, shell-out to bash `conformance/check.sh` for C- / D- gates**

- `envelopeVerify` runs in two phases:
  1. **TS-native**: ajv validates the envelope JSON against `schemas/envelope.v1.json` (E- gates per `conformance/lib/envelope.sh:14-92`) and recomputes `integrity.value` with Node `crypto.createHash("sha256")` / `crypto.createHmac("sha256", ECL_HMAC_KEY)` (I- gates).
  2. **Shell-out**: spawn `bash conformance/check.sh <envelope> --contracts <dir>` for the C- (contract-graph) and D- (context-budget) gates. The bash checker is the canonical source of truth for those gates today (F-6.1, GAP-1); reimplementing them in TS this round duplicates the cross-edge graph walk for no immediate gain.
  3. The TS verifier returns a structured `VerifyResult` aggregating both phases; failures are reported with their gate code (`E-1.1` … `D-2`) and the originating phase (`ts-ajv` | `bash-checker`).
- Rationale: hybrid matches the canonical posture (bash is reference) while still proving ajv can do real JSON Schema 2020-12 validation. Pure shell-out wastes the TS distribution path (consumers without bash get nothing); pure TS reimplementation duplicates work in scope creep.
- Container note: `conformance/check.sh` runs inside the dev container too — the bind-mount at `/workspace` (compose.yml:17) exposes the full ECL repo, and the Dockerfile installs `jq` + `bash` (`Dockerfile.dev:22-30`).

---

## GAP resolutions

| GAP | Resolution |
|---|---|
| GAP-1 (jq-not-ajv today) | TS SDK becomes the first ajv-based validator. Documented in `src/envelopeVerify.ts` jsdoc; not promoted to bash. |
| GAP-2 (unused contract fields `schema_ref`, `required_sections`, `evidence_anchor_required`) | Deferred. Out of scope for this PR. Track as drift register entry `D-?` in S1.5 if not lifted by v1.2. |
| GAP-3 (UUIDv7 library) | Use `uuid` v10.x. `uuidv7()` is the default for `message_id` and `thread_id`. Bash emits v4; TS upgrading to v7 is spec-compliant (RECOMMENDED per envelope.v1.json:29) and not a parity break — the envelope format does not record the UUID version, only `format: "uuid"`. |
| GAP-4 (TS error model) | Introduce `EclError extends Error` with discriminant `code` enum drawn from ECL §5.3 failure codes plus three SDK-internal codes (`USAGE`, `INTEGRITY_COMPUTE_FAILED`, `IO_FAILED`). Maps to bash exit codes via the CLI wrapper (deferred to a later story). Throwing is the in-process surface; CLI wrappers translate to exit codes. |
| GAP-5 (Dockerfile.dev greenfield) | Resolved — container scaffold already landed on `feat/v1.1.0-ts-sdk` (`reference-sdk/ts/{Dockerfile.dev, compose.yml, Makefile, .dockerignore, .gitignore, README.md}`). Spec assumes INFRA-DONE. |
| GAP-6 (receive-side trace events unwritten) | Design `handoffEmit` and `envelopeVerify` so the SDK CAN write `receive` / `verify_pass` / `verify_fail` events. For this PR, `handoffEmit` emits `emit` only (matching bash); `envelopeVerify` writes `verify_pass` / `verify_fail` ONLY when a `--trace-dir` option is supplied (opt-in). Default behaviour: read-only verify, no trace write. Future receivers can use the same primitives. |

---

## Stories (5)

### S1 — Scaffold (foundational; blocks S2–S5)

**Goal:** stand up the TypeScript project so subsequent stories can `import` types and run `make check` green.

**Files to create:**

- `reference-sdk/ts/package.json` — `"private": true`, name `@eidolons/ecl-sdk`, version `1.1.0`, `type: "module"`, scripts (`build`, `test`, `test:watch`, `lint`, `lint:fix`), engines `{node: ">=22"}`, license `Apache-2.0`, dependencies (`ajv@^8.17.0`, `ajv-formats@^3.0.1`, `uuid@^10.0.0`), devDependencies (`typescript@^5.5`, `vitest@^2`, `tsup@^8`, `@biomejs/biome@^1.8`, `@types/node@^22`).
- `reference-sdk/ts/tsconfig.json` — `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `strict: true`, `noUncheckedIndexedAccess: true`, `declaration: true`, `outDir: "dist"`, `rootDir: "src"`.
- `reference-sdk/ts/vitest.config.ts` — coverage provider v8, threshold 70% (suggested, not hard), test glob `src/**/*.test.ts`.
- `reference-sdk/ts/tsup.config.ts` — entry `src/index.ts`, dual `format: ["esm", "cjs"]`, declaration true, plus a second config object `entry: { "eidolons-ecl-sdk.bundle": "src/index.ts" }, format: ["esm"], noSplitting: true, minify: true` for the vendor bundle.
- `reference-sdk/ts/biome.json` — formatter + linter, 2-space indent, line width 100, recommended rules.
- `reference-sdk/ts/pnpm-lock.yaml` — generated by `make install`.
- `reference-sdk/ts/src/index.ts` — barrel export of `envelopeBuild`, `envelopeVerify`, `handoffEmit`, `traceTail`, plus types.
- `reference-sdk/ts/src/version.ts` — `export const ECL_VERSION_TARGET = "1.0" as const;` (per `docs/tech-choice.md:129`). For v1.1.x SDK targeting v1.0 spec; bumps lock-step with spec at v1.1.0.
- `reference-sdk/ts/src/types.ts` — hand-derived TypeScript interfaces:
  - `Envelope` — mirrors `schemas/envelope.v1.json` properties (no codegen this round; lock-step at spec v1.0 means manual derivation is cheap and reviewable).
  - `Contract` — mirrors `schemas/handoff-contract.v1.json`.
  - `TraceEvent` — mirrors `schemas/handoff-event.v1.json` with discriminated union on `event`.
  - `Performative` — `"REQUEST" | "INFORM" | "PROPOSE" | "CRITIQUE" | "DECIDE" | "DELEGATE" | "ACKNOWLEDGE" | "ESCALATE" | "RESUME" | "REFUSE"`.
  - `AgentRef`, `IntegrityMethod`, `TrustLevel`, `Tier`, `EdgeOrigin`.
- `reference-sdk/ts/src/errors.ts` — `EclError extends Error` with `code: VerifyFailureCode | "USAGE" | "INTEGRITY_COMPUTE_FAILED" | "IO_FAILED"`, optional `gate?: string`, optional `phase?: "ts-ajv" | "bash-checker"`.
- `reference-sdk/ts/src/scaffold.test.ts` — smoke test asserting the four function symbols are exported and the version constant equals `"1.0"`.

**Out of scope (S1):** any logic inside the four functions — stub them as `throw new EclError({ code: "USAGE", message: "not implemented" })` until S2–S5.

**Gates (G-Build, G-Test, G-Lint, G-Check):**

- **G-S1-Build**: `make build` exits 0; emits `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/eidolons-ecl-sdk.bundle.mjs`.
- **G-S1-Test**: `make test` exits 0; smoke test passes.
- **G-S1-Lint**: `make lint` exits 0.
- **G-S1-Check**: `make check` (install + build + test + lint) exits 0.
- **G-S1-NoHost**: verify no `node_modules` directory appears at the repo root or anywhere outside `reference-sdk/ts/`; verify `pnpm-store` lives in the container volume `ecl-ts-sdk-pnpm-store` per `compose.yml:30-32`.

**Confidence:** 0.93 (greenfield scaffolding; container already proven to build and shell).

---

### S2 — `envelopeBuild`

**Goal:** TS port of `reference-sdk/bash/envelope-build.sh`. API parity with all 22 flags; byte-equivalent envelope output for identical inputs (modulo `message_id`, `thread_id`, `trace.ts`).

**API:**

```typescript
export interface EnvelopeBuildOptions {
  // REQUIRED
  artifact: string;            // path to payload file (read as raw bytes)
  contract: string;            // path to contract YAML
  performative: Performative;
  objective: string;           // ≤ 240 chars
  // OPTIONAL — all mirror bash defaults exactly
  messageId?: string;          // default: uuidv7()
  threadId?: string;           // default: same as messageId
  parentId?: string | null;    // default: null
  fromVersion?: string;        // default: "0.0.0"
  toVersion?: string;          // default: "0.0.0"
  kind?: string;               // default: contract.artifacts[0].kind
  summary?: string;            // default: "(generated by envelopeBuild; populate before sending)"
  tokensUsed?: number;         // default: 0
  tokenBudget?: number;        // default: contract.context_delta?.token_budget_max ?? 4000
  confidence?: number;         // default: 0.5
  trustLevel?: TrustLevel;     // default: contract.trust_level ?? "standard"
  host?: string;               // default: process.env.ECL_HOST ?? "raw"
  model?: string;              // default: process.env.ECL_MODEL ?? "unknown"
  tier?: Tier;                 // default: "standard"
  integrityMethod?: IntegrityMethod; // default: "sha256"
}
export async function envelopeBuild(opts: EnvelopeBuildOptions): Promise<Envelope>;
```

**Internal mechanics:**

- YAML parser: `yaml` (eemeli/yaml) — pure-JS, no native deps; lighter than `js-yaml` for this scope. Add to dependencies in S1 (decision documented here, implementation lands in S2 — update `package.json` at S2 start).
- SHA-256: `crypto.createHash("sha256").update(fileBuffer).digest("hex")` — read the artifact via `fs.readFile(path)` to get raw bytes; `integrity.value` and `artifact.sha256` are both set to this digest (mirrors bash F-7.3).
- HMAC-SHA-256: `crypto.createHmac("sha256", process.env.ECL_HMAC_KEY!).update(fileBuffer).digest("hex")`. Throw `EclError({code: "USAGE"})` if `ECL_HMAC_KEY` is unset.
- Size: `fileBuffer.byteLength`.
- Timestamp: `new Date().toISOString().replace(/\.\d{3}Z$/, "Z")` (RFC 3339 UTC seconds — matches bash `date -u +"%Y-%m-%dT%H:%M:%SZ"`).
- `artifact.path` in the envelope: `path.basename(artifactPath)` (matches bash `:204`).
- UUID generator: `uuidv7()` from `uuid` v10.
- Key ordering in output JSON: produce keys in the exact order the bash `jq -n` builder produces (lines 218-245 of envelope-build.sh): `envelope_version, message_id, thread_id, parent_id, from, to, performative, edge_origin, objective, artifact, context_delta, constraints, confidence, integrity, trace`. This is a parity invariant — diff tooling depends on it.

**Out of scope (S2):** schema validation (lives in S3). The build helper deliberately emits an envelope without self-validating, matching bash F-2.1.

**Gates:**

- **G-S2-Build / Test / Lint / Check** (standard).
- **G-S2-Unit**: 90%+ line coverage on `envelopeBuild.ts` (default flags, every override, both integrity methods, missing-required-flag error path, unreadable-artifact error path, unparseable-contract error path).
- **G-S2-Conformance**: take the TS-emitted envelope for a fixture from `examples/atlas-spectra-apivr-chain/` (e.g. the `scout-report.md` artefact + `atlas-to-spectra.yaml` contract) and run `bash conformance/check.sh <envelope> --level=MUST` — exit code 0.
- **G-S2-Bash-Parity**: regenerate the same envelope with `bash reference-sdk/bash/envelope-build.sh` using the same flags + fixed `--message-id` / `--thread-id` (so the only intentional diff is `trace.ts`). `jq -S 'del(.trace.ts)' ts-out.json` MUST equal `jq -S 'del(.trace.ts)' bash-out.json`.

**Confidence:** 0.88 (well-bounded; flag table is in F-1.1; only risk is subtle key-ordering or number-vs-integer JSON shape — mitigated by G-S2-Bash-Parity).

---

### S3 — `envelopeVerify`

**Goal:** TS port of `reference-sdk/bash/envelope-verify.sh`. Per D-4, hybrid implementation: ajv for E- / I- gates in TS, shell-out for C- / D- gates.

**API:**

```typescript
export interface EnvelopeVerifyOptions {
  envelope: string;            // path to .envelope.json
  artifact?: string;           // optional; resolves from envelope.artifact.path otherwise
  contracts?: string;          // contracts directory; default <repoRoot>/contracts
  schemas?: string;            // schemas directory; default <repoRoot>/schemas
  traceDir?: string;           // optional; when set, writes verify_pass / verify_fail events
  json?: boolean;              // mirror bash --json; affects toString() format
}
export interface VerifyResult {
  ok: boolean;
  failures: Array<{
    gate: string;              // "E-1.1", "I-2", "C-3.1", "D-1", etc.
    code: VerifyFailureCode;   // ECL §5.3 failure code
    phase: "ts-ajv" | "bash-checker";
    message: string;
  }>;
  warnings: Array<{ gate: string; message: string }>;
}
export async function envelopeVerify(opts: EnvelopeVerifyOptions): Promise<VerifyResult>;
```

**Internal mechanics:**

- **Phase 1 (TS-ajv)**:
  - Load all six core schemas (`envelope.v1.json`, `performative.v1.json`, `handoff-contract.v1.json`, `context-delta.v1.json`, `handoff-event.v1.json`, `_base-profile.v1.json`) into a single `Ajv2020` instance via `addSchema`, keyed by `$id`.
  - Compile and run against the envelope; emit `SCHEMA_INVALID` failures on any ajv error.
  - Recompute integrity per `envelope.integrity.method` against the artifact bytes (resolved from `envelope.artifact.path` relative to envelope dir, unless `--artifact` overrides). Mismatch → `INTEGRITY_MISMATCH` failure.
- **Phase 2 (shell-out)**:
  - Spawn `bash conformance/check.sh <envelope-abs-path> --contracts <contracts-dir> --json` via `child_process.spawn` with stdio capture.
  - Parse the JSON output; extract C- and D- gate failures into the `failures` array with `phase: "bash-checker"`.
  - Treat exit codes 2/3 as gate failures, 4 as warnings, 0 as pass.
- **Trace integration (GAP-6)**: when `opts.traceDir` is provided, append one `verify_pass` or `verify_fail` event to `<traceDir>/<thread_id>.jsonl` after both phases complete. Use the same atomic-append discipline as S4 (per D-3).

**Out of scope (S3):** full TS reimplementation of C- / D- gates. Drift register D-? notes the duplication for future consolidation.

**Gates:**

- **G-S3-Build / Test / Lint / Check** (standard).
- **G-S3-Unit**: cover the seven `VerifyFailureCode` values; cover both `sha256` and `hmac-sha256` integrity recompute; cover the case where shell-out reports a C-gate failure not visible to ajv.
- **G-S3-Round-trip**: run S2's TS envelope through S3's TS verify → `ok: true`. Run the bash-emitted envelope through TS verify → `ok: true`. Run a deliberately-corrupted envelope (flipped one hex char in `integrity.value`) → `ok: false`, `failures[0].code: "INTEGRITY_MISMATCH"`.
- **G-S3-Cross-SDK**: envelopes built by `bash envelope-build.sh` are accepted by `envelopeVerify` (TS). Symmetric: TS-built envelopes pass `bash conformance/check.sh`. This is the core interop guarantee from `harness-roadmap.md:156`.

**Confidence:** 0.85 (ajv schema-bundle wiring against local `$id`s is the one fiddly piece; F-X.6 notes the per-Eidolon profile `$ref` is relative, so `loadSchema` callback may be needed for unbundled refs — APIVR-Δ should verify on first ajv compile).

---

### S4 — `handoffEmit`

**Goal:** TS port of `reference-sdk/bash/handoff-emit.sh`. Composes `envelopeBuild` + sidecar write + trace event append.

**API:**

```typescript
export interface HandoffEmitOptions extends EnvelopeBuildOptions {
  traceDir?: string;           // default: ".eidolons/.trace"
}
export interface EmitResult {
  envelope: Envelope;
  envelopePath: string;        // <artifact>.envelope.json
  tracePath: string;           // <traceDir>/<thread_id>.jsonl
}
export async function handoffEmit(opts: HandoffEmitOptions): Promise<EmitResult>;
```

**Internal mechanics:**

- Call `envelopeBuild(opts)` to get the envelope object.
- Write the envelope to `<artifact>.envelope.json` via `fs.writeFileSync(envelopePath, JSON.stringify(envelope, null, 2) + "\n")`. **Pretty-print with 2-space indent** to match a typical `jq -n` default; the bash builder's output is single-stream JSON — confirm format match with G-S4-Bash-Parity below.
- Append one `emit` event to `<traceDir>/<thread_id>.jsonl` via `fs.appendFileSync(tracePath, JSON.stringify(event) + "\n", { flag: "a" })` (per D-3).
- Trace event shape per `schemas/handoff-event.v1.json` (F-9.1): `{ts, event: "emit", message_id, thread_id, from: "<eidolon>@<version>", to: "<eidolon>@<version>", performative, integrity_method, context_tokens, model, tier}`.
- `mkdir -p` the trace dir (unconditional, matches bash `:53`).

**Out of scope (S4):** writing `receive` / `verify_pass` / `verify_fail` events (handled by S3 and downstream receivers).

**Gates:**

- **G-S4-Build / Test / Lint / Check** (standard).
- **G-S4-Unit**: cover both side effects (envelope sidecar exists with correct content; trace line appended); cover the case where the trace dir doesn't exist beforehand; cover concurrent emit (two `handoffEmit` calls to the same thread_id produce two well-formed JSONL lines).
- **G-S4-Conformance**: emit one envelope into a fresh tempdir; run `bash conformance/check.sh <tempdir> --level=MUST` → exit 0.
- **G-S4-Round-trip**: re-run `examples/atlas-spectra-apivr-chain/run.sh` semantically — drive the same three envelopes via TS `handoffEmit` instead of bash, then run `bash conformance/check.sh "$EX_DIR" --level=MUST` → exit 0. Trace file MUST contain three `emit` lines, each schema-valid against `handoff-event.v1.json`.
- **G-S4-Bash-Parity**: side-by-side diff of the envelope JSON written by TS vs bash on the same fixture, ignoring `message_id` / `thread_id` / `trace.ts`, MUST be empty.

**Confidence:** 0.87 (depends on S2 + S3 landing; main risk is JSON-formatting diff if bash and TS disagree on indentation — G-S4-Bash-Parity catches this).

---

### S5 — `traceTail`

**Goal:** TS port of `reference-sdk/bash/trace-tail.sh`. Returns an `AsyncIterable<TraceEvent>` so consumers can `for await (const ev of traceTail(...))`.

**API:**

```typescript
export interface TraceTailOptions {
  traceDir?: string;           // default: ".eidolons/.trace"
  thread?: string;             // single thread_id; if omitted, read all *.jsonl
  from?: string;               // eidolon slug (prefix-match on event.from)
  to?: string;                 // eidolon slug (prefix-match on event.to)
  follow?: boolean;            // default: false; when true, tail -F semantics
}
export function traceTail(opts: TraceTailOptions): AsyncIterable<TraceEvent>;
```

**Internal mechanics:**

- **Non-follow path**: read each `*.jsonl` file sorted by `LC_ALL=C` (lexicographic, matching bash `:51`), split by newline, JSON.parse each line, apply filters (`from` matches `event.from.startsWith(`${from}@`)`; symmetric for `to`), yield.
- **Follow path**: use `fs.watch` on the trace dir + per-file position tracking; on each `change` event, read from last position to EOF and yield new lines. Re-open on file rotation (`rename` event). Equivalent to `tail -F` semantics.
- Malformed lines (JSON.parse throws) are emitted as a warning to `stderr` and skipped — matches bash `jq -c` behaviour of erroring on the malformed line but continuing the stream.

**Gates:**

- **G-S5-Build / Test / Lint / Check** (standard).
- **G-S5-Unit**: cover non-follow with thread filter; non-follow with from/to filter; non-follow over multiple files in sort order; follow mode with a writer goroutine pattern (use `vi.useFakeTimers` + manual file appends).
- **G-S5-Bash-Parity**: run S4 example 3× to populate a thread JSONL, then run both `bash trace-tail.sh --thread <id>` and TS `traceTail({thread: <id>})` collecting events into arrays; arrays MUST be deep-equal modulo iteration order.
- **G-S5-No-Race**: 100 concurrent `handoffEmit` calls to the same thread_id followed by `traceTail({thread, follow: false})` reads all 100 events without truncation or interleaving (line-level atomicity per D-3).

**Confidence:** 0.84 (follow-mode cross-platform `fs.watch` is the soft underbelly — macOS APFS coalesces events differently than Linux inotify; APIVR-Δ may need a polling fallback. Bash `tail -F` papers over this in a single binary).

---

## TRANCE sequencing

```
Wave I  (serial):       S1 — Scaffold
Wave II (parallel × 2): S2 — envelopeBuild  ║  S5 — traceTail
Wave III (parallel × 2): S3 — envelopeVerify ║  S4 — handoffEmit
```

- S1 MUST close all four gates (G-S1-*) before Wave II starts; S2–S5 import types from `src/types.ts`.
- S2 and S5 share no code; safe to parallelize.
- S3 depends on S2 (verifies envelopes produced by it); S4 depends on S2 (composes it). S3 and S4 share no code; safe to parallelize once S2 is green.
- Each wave runs APIVR-Δ subagents with `model: "sonnet"`, `isolation: "worktree"`. Per the parent-agent memory: when fanning out 2+ subagents in the same wave, all but one MUST use `isolation: "worktree"` to avoid clobbering the branch.

---

## Container constraint (load-bearing)

Every gate listed above runs inside the `reference-sdk/ts/` dev container via:

```
make install   # pnpm install --frozen-lockfile
make build     # pnpm run build (tsc + tsup)
make test      # pnpm test --run (vitest)
make lint      # pnpm run lint (biome)
make check     # install + build + test + lint (CI parity)
```

Stories MUST NOT assume host-level `node`, `pnpm`, `npx`, `tsc`, or `vitest`. The host MUST stay free of Node toolchain pollution per `docs/tech-choice.md` Phase 0 and the maintainer's "all development inside containers" directive (`.atlas-scout/mission.md:21`).

`bash conformance/check.sh` ALSO runs inside the container (bind-mount at `/workspace`; `jq` + `bash` installed per `Dockerfile.dev:22-30`). G-S2-Conformance / G-S3-Round-trip / G-S4-Round-trip all invoke it from the container shell.

The `pnpm-store` named volume (`compose.yml:30-32`) persists between `compose run` invocations so installs are warm-cache fast.

---

## Validation gates — summary

| Story | Gate count | Gates |
|---|---:|---|
| S1 — Scaffold | 5 | Build, Test, Lint, Check, NoHost |
| S2 — envelopeBuild | 6 | Build, Test, Lint, Check, Unit, Conformance, Bash-Parity |
| S3 — envelopeVerify | 6 | Build, Test, Lint, Check, Unit, Round-trip, Cross-SDK |
| S4 — handoffEmit | 6 | Build, Test, Lint, Check, Unit, Conformance, Round-trip, Bash-Parity |
| S5 — traceTail | 6 | Build, Test, Lint, Check, Unit, Bash-Parity, No-Race |

(Counts treat the four Build/Test/Lint/Check as one tier and append story-specific gates.)

---

## Out of scope (this PR)

- npm publish — happens in a separate release PR after S1–S5 merge.
- Vendor-build release (single-file `.bundle.mjs` distribution) — produced by `make build` but published in the release PR.
- Python SDK (Phase 2, story S2.1).
- HMAC promotion to RECOMMENDED at `trust_level=high` (story S1.4).
- Threat-model documentation (story S1.3).
- Drift register population (story S1.5).
- Receiver-side runtime engine (Phase 3).
- A2A bridge (Phase 2, story S2.4).
- TS reimplementation of C- / D- conformance gates (drift register entry; not blocking).

---

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-TS-1 | ajv `$id`-by-bundle resolution fails for the relative `_base-profile.v1.json` $ref in per-Eidolon profiles (F-X.6). | S3 includes a unit test compiling all six schemas via `addSchema`; if it fails, fall back to `loadSchema` callback. APIVR-Δ flags on first ajv compile error and pauses before further wiring. |
| R-TS-2 | JSON key ordering diff between bash `jq -n` and TS `JSON.stringify`. | S2 explicitly fixes key order in the builder via an object literal in the canonical order (F-1.1 + envelope-build.sh:218-245). G-S2-Bash-Parity catches drift. |
| R-TS-3 | `fs.watch` cross-platform inconsistency for S5 follow mode. | Document the macOS/Linux behavioural difference in jsdoc; if APIVR-Δ hits flake, add a polling fallback (e.g. 250ms `fs.stat` loop) under a `pollInterval` opt-in. |
| R-TS-4 | Container build cost on cold cache (CI). | The named `pnpm-store` volume warms after first `make install`; CI MAY skip clean rebuilds by caching the volume. Not in this PR's scope. |
| R-TS-5 | UUIDv7 → bash-emitted UUIDv4 diff in interop. | The envelope schema validates `format: "uuid"` only (no version check, F-8.2). Bash verifies TS envelopes without issue. Documented in `src/envelopeBuild.ts` jsdoc. |

---

## Acceptance (PR-level)

The TS SDK port PR (`feat/v1.1.0-ts-sdk` → `main` of `Rynaro/eidolons-ecl`) ships when:

1. All five stories S1–S5 close all their gates.
2. `make check` exits 0 inside the dev container.
3. Both `examples/atlas-spectra-apivr-chain/run.sh` and `examples/apivr-vigil-escalation/run.sh` pass conformance when re-run via TS `handoffEmit` instead of bash (G-S4-Round-trip).
4. No host-level `node_modules` / `pnpm-store` artefacts exist outside `reference-sdk/ts/` and the named container volume.
5. README at `reference-sdk/ts/README.md` already names the four APIs (`:7-12`); no further README work in this PR beyond auto-updating once `src/version.ts` lands.

---

## Provenance

- Scout: ATLAS v1.4.2 — `/Users/henrique/workspace/oss/agents/eidolons-ecl/.atlas-scout/scout-report.md` (2026-05-11).
- Tech-choice ground: `/Users/henrique/workspace/oss/agents/eidolons-ecl/docs/tech-choice.md` (Option F committed 2026-05-11).
- Spec authored: SPECTRA v4.2.11 — 2026-05-11.
- Hand-off target: APIVR-Δ v3.0.5, TRANCE wave (4 subagents, model: sonnet, isolation: worktree, branch: feat/v1.1.0-ts-sdk).
- Companion: `/Users/henrique/workspace/oss/agents/eidolons-ecl/.spectra/ts-sdk-port.yaml` (machine-readable hand-off contract).
