/**
 * envelopeVerify — TypeScript port of reference-sdk/bash/envelope-verify.sh.
 *
 * Hybrid implementation per D-4 (SPECTRA spec §"Decisions resolved"):
 *
 *   Phase 1 — TS-native (ajv):
 *     - Loads all core schemas into a single Ajv2020 instance keyed by $id.
 *     - Validates the envelope JSON against envelope.v1.json (E- gates).
 *     - Recomputes integrity.value against the artifact bytes (I- gates).
 *
 *   Phase 2 — shell-out:
 *     - Spawns `bash conformance/check.sh <envelope> --json` for C- and D- gates.
 *     - Parses JSON output; maps each result into a GateFailure with
 *       phase: "bash-checker".
 *     - Skipped when `skipShellGates: true` (unit-test flag).
 *
 * Locating conformance/check.sh (shell-out path resolution):
 *   1. Honour `ECL_CONFORMANCE_CHECK` env var if set (absolute or relative).
 *   2. Walk up from the envelope's directory looking for
 *      `conformance/check.sh` (mirrors bash SDK_DIR/../.. logic — F-6.1).
 *   3. Fall back to `<repoRoot>/conformance/check.sh` where repoRoot is
 *      resolved by walking up until a `conformance/` directory is found.
 *
 * Trace integration (GAP-6):
 *   When `opts.traceDir` is provided, appends one `verify_pass` or
 *   `verify_fail` event to `<traceDir>/<thread_id>.jsonl` after both
 *   phases complete. Uses O_APPEND atomic-write discipline (D-3).
 *
 * @see reference-sdk/bash/envelope-verify.sh — bash reference
 * @see conformance/check.sh — C- and D- gate canonical implementation
 * @see .spectra/ts-sdk-port.md §S3 — Story S3 spec
 */

import { spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import { EclError } from "./errors.js";
import type { VerifyFailureCode } from "./errors.js";
import type { Envelope } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EnvelopeVerifyOptions {
  /** Absolute or relative path to the .envelope.json file. */
  envelope: string;
  /**
   * Optional path to the artifact payload. When absent, resolved from
   * `envelope.artifact.path` relative to the envelope's directory (the
   * co-located sidecar layout — matching bash behaviour).
   */
  artifact?: string;
  /**
   * Path to the contracts directory. Defaults to `<repoRoot>/contracts`
   * (mirrors bash --contracts flag + F-6.1).
   */
  contracts?: string;
  /**
   * Path to the schemas directory. Defaults to `<repoRoot>/schemas`.
   */
  schemas?: string;
  /**
   * When provided, writes a `verify_pass` or `verify_fail` trace event to
   * `<traceDir>/<thread_id>.jsonl` after both phases complete (GAP-6).
   */
  traceDir?: string;
  /**
   * Mirror bash --json flag. Currently affects toString() formatting only;
   * `VerifyResult` is always structured.
   */
  json?: boolean;
  /**
   * When true, skip the shell-out phase entirely (no bash spawn). Designed
   * for unit tests that cannot rely on the container bash environment.
   * Default: false.
   */
  skipShellGates?: boolean;
}

export interface GateFailure {
  /** Gate code, e.g. "E-1.1", "I-3", "C-2", "D-1". */
  gate: string;
  /** ECL §5.3 failure code. */
  code: VerifyFailureCode;
  /** Which validation phase produced this failure. */
  phase: "ts-ajv" | "bash-checker";
  /** Human-readable message. */
  message: string;
}

export interface GateWarning {
  gate: string;
  message: string;
}

export interface VerifyResult {
  ok: boolean;
  failures: GateFailure[];
  warnings: GateWarning[];
}

// ---------------------------------------------------------------------------
// Schema loading
// ---------------------------------------------------------------------------

/** Absolute paths to all core schema files that must be loaded into ajv. */
function coreSchemaFiles(schemasDir: string): string[] {
  return [
    path.join(schemasDir, "envelope.v1.json"),
    path.join(schemasDir, "performative.v1.json"),
    path.join(schemasDir, "context-delta.v1.json"),
    path.join(schemasDir, "handoff-contract.v1.json"),
    path.join(schemasDir, "handoff-event.v1.json"),
    path.join(schemasDir, "per-eidolon", "_base-profile.v1.json"),
  ];
}

/** Build and return an Ajv2020 instance with all schemas pre-loaded. */
function buildAjv(schemasDir: string): {
  ajv: Ajv2020;
  envelopeSchemaId: string;
} {
  // strict: false — needed for the if/then pattern in handoff-contract.v1.json
  // (F-2.6, D-1). allowMatchingProperties accommodates the notes-property
  // duplication under allOf.
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  let envelopeSchemaId = "";

  for (const schemaFile of coreSchemaFiles(schemasDir)) {
    let raw: string;
    try {
      raw = fs.readFileSync(schemaFile, "utf8");
    } catch (err) {
      throw new EclError({
        code: "IO_FAILED",
        message: `Cannot read schema file: ${schemaFile}`,
        cause: err,
      });
    }

    let schema: Record<string, unknown>;
    try {
      schema = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      throw new EclError({
        code: "IO_FAILED",
        message: `Cannot parse schema file: ${schemaFile}`,
        cause: err,
      });
    }

    // Per-Eidolon profiles may have relative $refs (_base-profile.v1.json).
    // ajv resolves cross-file refs by $id when all schemas are pre-loaded via
    // addSchema (F-X.6, R-TS-1). The six core schemas all use absolute $id
    // URLs so no rewriting is needed here. Per-Eidolon profiles are loaded
    // separately below.

    if (!ajv.getSchema(schema.$id as string)) {
      ajv.addSchema(schema);
    }

    if (typeof schema.$id === "string" && (schema.$id as string).includes("envelope.v1.json")) {
      envelopeSchemaId = schema.$id as string;
    }
  }

  // Also load per-Eidolon profiles so cross-file $refs resolve.
  const perEidolonDir = path.join(schemasDir, "per-eidolon");
  if (fs.existsSync(perEidolonDir)) {
    for (const entry of fs.readdirSync(perEidolonDir)) {
      if (!entry.endsWith(".json") || entry === "_base-profile.v1.json") continue;
      const profilePath = path.join(perEidolonDir, entry);
      let raw: string;
      try {
        raw = fs.readFileSync(profilePath, "utf8");
      } catch {
        continue;
      }
      try {
        const schema = JSON.parse(raw) as Record<string, unknown>;
        if (typeof schema.$id === "string" && !ajv.getSchema(schema.$id)) {
          ajv.addSchema(schema);
        }
      } catch {}
    }
  }

  if (!envelopeSchemaId) {
    throw new EclError({
      code: "USAGE",
      message: `envelope.v1.json not found in schemas directory: ${schemasDir}`,
    });
  }

  return { ajv, envelopeSchemaId };
}

// ---------------------------------------------------------------------------
// Repo-root resolution (for locating conformance/check.sh)
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` until we find a directory containing
 * `conformance/check.sh`. Returns that directory or null.
 */
function findRepoRoot(startDir: string): string | null {
  let current = startDir;
  for (let depth = 0; depth < 20; depth++) {
    const candidate = path.join(current, "conformance", "check.sh");
    if (fs.existsSync(candidate)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return null;
}

/**
 * Resolve the path to `conformance/check.sh`.
 *
 * Priority:
 *   1. `ECL_CONFORMANCE_CHECK` env var (absolute or relative-to-cwd).
 *   2. Walk up from envelope directory (mirrors bash SDK_DIR/../.. — F-6.1).
 *   3. Walk up from process.cwd().
 */
function resolveConformanceCheck(envelopeDir: string): string | null {
  const envOverride = process.env.ECL_CONFORMANCE_CHECK;
  if (envOverride) {
    const resolved = path.isAbsolute(envOverride)
      ? envOverride
      : path.resolve(process.cwd(), envOverride);
    if (fs.existsSync(resolved)) return resolved;
  }

  const repoFromEnvelope = findRepoRoot(envelopeDir);
  if (repoFromEnvelope) {
    return path.join(repoFromEnvelope, "conformance", "check.sh");
  }

  const repoFromCwd = findRepoRoot(process.cwd());
  if (repoFromCwd) {
    return path.join(repoFromCwd, "conformance", "check.sh");
  }

  return null;
}

/**
 * Resolve the schemas directory.
 * Priority: explicit opts.schemas → walk repo root → cwd.
 */
function resolveSchemasDir(envelopeDir: string, explicitSchemas?: string): string {
  if (explicitSchemas) {
    return path.isAbsolute(explicitSchemas)
      ? explicitSchemas
      : path.resolve(process.cwd(), explicitSchemas);
  }
  const repoRoot = findRepoRoot(envelopeDir) ?? findRepoRoot(process.cwd());
  if (repoRoot) return path.join(repoRoot, "schemas");
  throw new EclError({
    code: "USAGE",
    message: "Cannot locate schemas directory. Supply opts.schemas or set ECL_CONFORMANCE_CHECK.",
  });
}

/**
 * Resolve the contracts directory.
 * Priority: explicit opts.contracts → walk repo root → cwd.
 */
function resolveContractsDir(envelopeDir: string, explicitContracts?: string): string {
  if (explicitContracts) {
    return path.isAbsolute(explicitContracts)
      ? explicitContracts
      : path.resolve(process.cwd(), explicitContracts);
  }
  const repoRoot = findRepoRoot(envelopeDir) ?? findRepoRoot(process.cwd());
  if (repoRoot) return path.join(repoRoot, "contracts");
  throw new EclError({
    code: "USAGE",
    message: "Cannot locate contracts directory. Supply opts.contracts.",
  });
}

// ---------------------------------------------------------------------------
// Integrity recomputation
// ---------------------------------------------------------------------------

function computeSha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function computeHmacSha256(buf: Buffer, key: string): string {
  return crypto.createHmac("sha256", key).update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// Shell-out phase
// ---------------------------------------------------------------------------

interface BashCheckerResult {
  id: string;
  level: string;
  status: string;
  name: string;
  reason?: string;
  target?: string;
}

interface BashCheckerOutput {
  results: BashCheckerResult[];
  exit_code: number;
}

/**
 * Map a bash-checker gate name to a VerifyFailureCode.
 * The mapping covers all gates in conformance/lib/ (C-/D- prefix only here,
 * since E-/I- are handled by TS-ajv).
 */
function mapBashNameToCode(id: string, name: string, status: string): VerifyFailureCode {
  if (id.startsWith("C-")) {
    if (name.includes("contract_for_edge") || id === "C-1") return "EDGE_UNKNOWN";
    if (name.includes("performative") || id === "C-2") return "PERFORMATIVE_NOT_ALLOWED";
    if (name.includes("artifact_kind") || id === "C-3") return "ARTIFACT_KIND_NOT_ALLOWED";
    return "EDGE_UNKNOWN";
  }
  if (id.startsWith("D-")) {
    return "BUDGET_EXCEEDED";
  }
  // E- and I- gate failures from shell-out (shouldn't normally reach here
  // since Phase 1 handles those, but handle gracefully).
  if (name.includes("integrity") || id.startsWith("I-")) return "INTEGRITY_FAIL";
  if (name.includes("section") || name.includes("MISSING")) return "MISSING_SECTION";
  return "SCHEMA_MISMATCH";
}

async function runBashChecker(
  checkScript: string,
  envelopePath: string,
  contractsDir: string
): Promise<{ failures: GateFailure[]; warnings: GateWarning[]; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const failures: GateFailure[] = [];
    const warnings: GateWarning[] = [];

    const child = spawn(
      "bash",
      [checkScript, envelopePath, "--contracts", contractsDir, "--json"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new EclError({
          code: "IO_FAILED",
          message: `Failed to spawn bash conformance checker: ${err.message}`,
          cause: err,
        })
      );
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;

      // Exit code 1 = bad usage / script-level error (not gate failures).
      if (exitCode === 1) {
        reject(
          new EclError({
            code: "IO_FAILED",
            message: `conformance/check.sh exited 1 (usage error): ${stderr.trim()}`,
          })
        );
        return;
      }

      let parsed: BashCheckerOutput;
      try {
        parsed = JSON.parse(stdout) as BashCheckerOutput;
      } catch {
        // Non-JSON output means the checker had an internal error.
        reject(
          new EclError({
            code: "IO_FAILED",
            message: `conformance/check.sh produced non-JSON output: ${stdout.slice(0, 200)}`,
          })
        );
        return;
      }

      for (const r of parsed.results) {
        // Only surface C- and D- gate results from the shell-out phase;
        // E- and I- are handled by the TS-ajv phase.
        const isShellOutGate = r.id.startsWith("C-") || r.id.startsWith("D-");

        if (r.status === "fail" && isShellOutGate) {
          failures.push({
            gate: r.id,
            code: mapBashNameToCode(r.id, r.name, r.status),
            phase: "bash-checker",
            message: r.reason ?? r.name,
          });
        } else if (r.status === "warn" && isShellOutGate) {
          warnings.push({
            gate: r.id,
            message: r.reason ?? r.name,
          });
        }
      }

      resolve({ failures, warnings, exitCode });
    });
  });
}

// ---------------------------------------------------------------------------
// Trace event append (GAP-6)
// ---------------------------------------------------------------------------

function appendTraceEvent(
  traceDir: string,
  envelope: Envelope,
  ok: boolean,
  firstFailureCode?: VerifyFailureCode
): void {
  try {
    fs.mkdirSync(traceDir, { recursive: true });
  } catch {
    // Best-effort; don't fail verification because trace write failed.
    return;
  }

  const tracePath = path.join(traceDir, `${envelope.thread_id}.jsonl`);
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const baseEvent = {
    ts,
    message_id: envelope.message_id,
    thread_id: envelope.thread_id,
    from: `${envelope.from.eidolon}@${envelope.from.version}`,
    to: `${envelope.to.eidolon}@${envelope.to.version}`,
    performative: envelope.performative,
    integrity_method: envelope.integrity.method,
  };

  const event = ok
    ? { ...baseEvent, event: "verify_pass" }
    : { ...baseEvent, event: "verify_fail", verify_failure_code: firstFailureCode };

  try {
    fs.appendFileSync(tracePath, `${JSON.stringify(event)}\n`, { flag: "a" });
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Main implementation
// ---------------------------------------------------------------------------

export async function envelopeVerify(opts: EnvelopeVerifyOptions): Promise<VerifyResult> {
  if (!opts.envelope) {
    throw new EclError({ code: "USAGE", message: "Required: envelope" });
  }

  // Resolve envelope to absolute path.
  const envelopePath = path.isAbsolute(opts.envelope)
    ? opts.envelope
    : path.resolve(process.cwd(), opts.envelope);

  // Read and parse the envelope JSON.
  let envelopeRaw: string;
  try {
    envelopeRaw = fs.readFileSync(envelopePath, "utf8");
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot read envelope: ${envelopePath}`,
      cause: err,
    });
  }

  let envelopeJson: unknown;
  try {
    envelopeJson = JSON.parse(envelopeRaw);
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot parse envelope JSON: ${envelopePath}`,
      cause: err,
    });
  }

  const envelopeDir = path.dirname(envelopePath);

  // Resolve directories.
  const schemasDir = resolveSchemasDir(envelopeDir, opts.schemas);
  const contractsDir = resolveContractsDir(envelopeDir, opts.contracts);

  const failures: GateFailure[] = [];
  const warnings: GateWarning[] = [];

  // =========================================================================
  // Phase 1 — TS-ajv: E- and I- gates
  // =========================================================================

  // --- E- gates (schema validation) ----------------------------------------

  let ajv: Ajv2020;
  let envelopeSchemaId: string;
  try {
    ({ ajv, envelopeSchemaId } = buildAjv(schemasDir));
  } catch (err) {
    // Schema loading failure is a hard error (can't validate without schemas).
    throw err instanceof EclError
      ? err
      : new EclError({ code: "IO_FAILED", message: "Schema bundle load failed", cause: err });
  }

  const validate = ajv.getSchema(envelopeSchemaId);
  if (!validate) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Compiled validator not found for schema $id: ${envelopeSchemaId}`,
    });
  }

  const schemaValid = validate(envelopeJson);
  if (!schemaValid && validate.errors) {
    for (const err of validate.errors) {
      const gateCode = deriveEGate(err);
      failures.push({
        gate: gateCode,
        code: "SCHEMA_MISMATCH",
        phase: "ts-ajv",
        message: `${err.instancePath || "(root)"} ${err.message ?? "schema violation"}`,
      });
    }
  }

  // --- I- gates (integrity recomputation) ----------------------------------

  // Resolve artifact path.
  const envelope = envelopeJson as Envelope;

  // Only run I- gates if the envelope parsed (has basic structure).
  if (envelope && typeof envelope === "object" && envelope.integrity && envelope.artifact) {
    const artifactRelPath = envelope.artifact.path;
    let artifactAbsPath: string;

    if (opts.artifact) {
      artifactAbsPath = path.isAbsolute(opts.artifact)
        ? opts.artifact
        : path.resolve(process.cwd(), opts.artifact);
    } else {
      // Resolve from envelope dir — try basename first (co-located sidecar),
      // then full path, then relative to envelope dir. Mirrors integrity.sh.
      const basename = path.basename(artifactRelPath);
      const candidates = [
        path.join(envelopeDir, basename),
        artifactRelPath,
        path.join(envelopeDir, artifactRelPath),
      ];
      const found = candidates.find((c) => fs.existsSync(c));
      if (!found) {
        failures.push({
          gate: "I-2",
          code: "INTEGRITY_FAIL",
          phase: "ts-ajv",
          message: `Artifact not found: ${artifactRelPath} (searched relative to ${envelopeDir})`,
        });
        artifactAbsPath = "";
      } else {
        artifactAbsPath = found;
      }
    }

    if (artifactAbsPath) {
      let artifactBuf: Buffer;
      try {
        artifactBuf = fs.readFileSync(artifactAbsPath);
      } catch (err) {
        failures.push({
          gate: "I-2",
          code: "INTEGRITY_FAIL",
          phase: "ts-ajv",
          message: `Cannot read artifact: ${artifactAbsPath}`,
        });
        artifactBuf = Buffer.alloc(0);
      }

      if (artifactBuf.length > 0 || fs.existsSync(artifactAbsPath)) {
        const method = envelope.integrity.method;
        const declaredValue = envelope.integrity.value;

        let computed: string | null = null;
        try {
          if (method === "sha256") {
            computed = computeSha256(artifactBuf);
          } else if (method === "hmac-sha256") {
            const hmacKey = process.env.ECL_HMAC_KEY;
            if (!hmacKey) {
              // Per integrity.sh:85-87: warn, not fail, when key unset.
              warnings.push({
                gate: "I-3",
                message: "ECL_HMAC_KEY unset; HMAC unverifiable per §6.2.3",
              });
            } else {
              computed = computeHmacSha256(artifactBuf, hmacKey);
            }
          } else {
            failures.push({
              gate: "I-3",
              code: "INTEGRITY_FAIL",
              phase: "ts-ajv",
              message: `Unsupported integrity method: ${String(method)}`,
            });
          }
        } catch (err) {
          throw new EclError({
            code: "INTEGRITY_COMPUTE_FAILED",
            message: "Integrity computation failed",
            cause: err,
          });
        }

        if (computed !== null) {
          if (computed === declaredValue) {
            // pass — no failure recorded
          } else {
            failures.push({
              gate: "I-3",
              code: "INTEGRITY_FAIL",
              phase: "ts-ajv",
              message: `Integrity mismatch: expected ${declaredValue} got ${computed}`,
            });
          }
        }

        // I-4 (SHOULD): artifact.size_bytes matches actual file size.
        const declaredSize = envelope.artifact.size_bytes;
        const actualSize = artifactBuf.byteLength;
        if (declaredSize !== undefined && declaredSize !== actualSize) {
          warnings.push({
            gate: "I-4",
            message: `size_bytes mismatch: declared=${declaredSize} actual=${actualSize}`,
          });
        }
      }
    }
  }

  // =========================================================================
  // Phase 2 — shell-out: C- and D- gates
  // =========================================================================

  if (opts.skipShellGates !== true) {
    const checkScript = resolveConformanceCheck(envelopeDir);
    if (!checkScript) {
      // Can't find the checker — emit a warning rather than hard-failing,
      // since the caller may be in an environment without the full repo.
      warnings.push({
        gate: "C/D",
        message:
          "conformance/check.sh not found; C- and D- gates skipped. " +
          "Set ECL_CONFORMANCE_CHECK to the path of check.sh.",
      });
    } else {
      try {
        const shellResult = await runBashChecker(checkScript, envelopePath, contractsDir);
        failures.push(...shellResult.failures);
        warnings.push(...shellResult.warnings);
      } catch (err) {
        if (err instanceof EclError) throw err;
        throw new EclError({
          code: "IO_FAILED",
          message: "Shell-out to conformance/check.sh failed",
          cause: err,
        });
      }
    }
  }

  // =========================================================================
  // Aggregate result
  // =========================================================================

  const ok = failures.length === 0;

  // Trace integration (GAP-6).
  if (opts.traceDir && envelope && typeof envelope === "object" && envelope.thread_id) {
    const firstFailCode: VerifyFailureCode | undefined = failures[0]?.code;
    appendTraceEvent(opts.traceDir, envelope, ok, firstFailCode);
  }

  return { ok, failures, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map an ajv error to a gate code in the E-* namespace.
 * ajv does not produce numbered sub-gate codes by default; we derive a
 * best-effort mapping from the instance path and keyword.
 */
function deriveEGate(err: { instancePath: string; keyword: string; message?: string }): string {
  const p = err.instancePath;

  // E-1: top-level parse (caught before ajv in the main flow, but guard here).
  if (p === "" && err.keyword === "type") return "E-1";

  // E-2: required field missing.
  if (err.keyword === "required") return "E-2";

  // E-3: envelope_version pattern mismatch.
  if (p.includes("envelope_version")) return "E-3";

  // E-4: performative enum violation.
  if (p.includes("performative")) return "E-4";

  // E-5: agent refs (from/to) pattern mismatch.
  if (p.startsWith("/from") || p.startsWith("/to")) return "E-5";

  // E-6: artifact.path pattern (no leading / or ..).
  if (p.includes("/artifact/path")) return "E-6";

  // E-8: trace.tier enum mismatch.
  if (p.includes("/trace/tier")) return "E-8";

  // Generic schema violation.
  return "E-9";
}
