/**
 * Tests for envelopeVerify — Story S3.
 *
 * Coverage targets (G-S3-Unit):
 *   - Happy path: valid envelope + co-located artifact → ok: true, all E-/I- pass.
 *   - Sad path 1: mutated integrity.value → ok: false, I-3 failure, phase: "ts-ajv".
 *   - Sad path 2: invalid performative → ok: false, E-4 failure, phase: "ts-ajv".
 *   - Sad path 3: malformed JSON file → throws EclError({ code: "IO_FAILED" }).
 *   - Sad path 4: missing envelope file → throws EclError({ code: "IO_FAILED" }).
 *   - skipShellGates: true → returns only E-/I- gate results (no spawn).
 *   - skipShellGates: false → invokes bash and returns C-/D- gate results.
 *   - sha256 and hmac-sha256 integrity recompute paths are exercised.
 *   - traceDir: verify_pass / verify_fail events are appended when traceDir set.
 *   - HMAC unset → I-3 warn (not fail) per integrity.sh §6.2.3.
 *   - Artifact not found → I-2 failure in failures array.
 */

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { envelopeBuild } from "./envelopeBuild.js";
import { envelopeVerify } from "./envelopeVerify.js";
import { EclError } from "./errors.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FIXTURE_CONTENT = "hello world\n";
const FIXTURE_SHA256 = "a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447";

const MINIMAL_CONTRACT_YAML = `
contract_version: "1.0"
from: atlas
to: spectra
edge_origin: roster
performatives_allowed:
  - PROPOSE
  - INFORM
  - REFUSE
artifacts:
  - kind: scout-report
    schema_ref: ../schemas/per-eidolon/scout-report.v1.json
context_delta:
  token_budget_max: 4000
trust_level: standard
`.trimStart();

let tmpDir: string;
let artifactPath: string;
let contractPath: string;
// Schemas and contracts dirs — walk up from the test's artifact dir.
// The test itself passes opts.schemas / opts.contracts explicitly so we
// don't rely on the walk-up heuristic in the test environment.
let schemasDir: string;
let contractsDir: string;

// Build one valid envelope JSON and write it to disk next to the artifact.
let validEnvelopePath: string;

/**
 * Find the repo root by walking up from __dirname. Works both in the
 * container (/workspace) and on the host (arbitrary path).
 */
function findRepoRoot(): string {
  let dir = path.resolve(import.meta.dirname ?? process.cwd());
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, "conformance", "check.sh"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: use ECL_CONFORMANCE_CHECK env or give up.
  const check = process.env.ECL_CONFORMANCE_CHECK;
  if (check) return path.dirname(path.dirname(check));
  throw new Error("Cannot find repo root (conformance/check.sh not found)");
}

let repoRoot: string;

beforeAll(async () => {
  repoRoot = findRepoRoot();
  schemasDir = path.join(repoRoot, "schemas");
  contractsDir = path.join(repoRoot, "contracts");

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecl-verify-test-"));
  artifactPath = path.join(tmpDir, "scout-report.md");
  contractPath = path.join(tmpDir, "atlas-to-spectra.yaml");

  fs.writeFileSync(artifactPath, FIXTURE_CONTENT, "utf8");
  fs.writeFileSync(contractPath, MINIMAL_CONTRACT_YAML, "utf8");

  // Build a valid envelope using envelopeBuild, then write it next to the artifact.
  const envelope = await envelopeBuild({
    artifact: artifactPath,
    contract: contractPath,
    performative: "PROPOSE",
    objective: "Hand off scout report for S3 verify test.",
    fromVersion: "1.4.2",
    toVersion: "4.2.11",
  });

  validEnvelopePath = path.join(tmpDir, "scout-report.md.envelope.json");
  fs.writeFileSync(validEnvelopePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  // Clean up ECL_HMAC_KEY between tests.
  delete process.env.ECL_HMAC_KEY;
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("envelopeVerify — happy path", () => {
  it("returns ok: true for a valid envelope built by envelopeBuild", async () => {
    const result = await envelopeVerify({
      envelope: validEnvelopePath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("does not include I- failures when integrity is correct", async () => {
    const result = await envelopeVerify({
      envelope: validEnvelopePath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    const integrityFailures = result.failures.filter((f) => f.gate.startsWith("I-"));
    expect(integrityFailures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sad path 1 — mutated integrity.value
// ---------------------------------------------------------------------------

describe("envelopeVerify — integrity mismatch", () => {
  it("sad path 1: mutated integrity.value → ok: false, I-3 failure, phase: ts-ajv", async () => {
    // Build a valid envelope, mutate integrity.value.
    const envelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Mutation test.",
    });

    // Flip one hex char in the integrity value.
    const original = envelope.integrity.value;
    const mutated = original.slice(0, -1) + (original.endsWith("0") ? "1" : "0");
    const corrupted = { ...envelope, integrity: { ...envelope.integrity, value: mutated } };
    // Also corrupt artifact.sha256 to avoid false positive from sha256 field.
    corrupted.artifact = { ...corrupted.artifact, sha256: mutated };

    const corruptedPath = path.join(tmpDir, "corrupted.envelope.json");
    fs.writeFileSync(corruptedPath, `${JSON.stringify(corrupted, null, 2)}\n`, "utf8");

    const result = await envelopeVerify({
      envelope: corruptedPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    expect(result.ok).toBe(false);
    const i3 = result.failures.find((f) => f.gate === "I-3");
    expect(i3).toBeDefined();
    expect(i3?.phase).toBe("ts-ajv");
    // The spec maps integrity failures to INTEGRITY_FAIL.
    expect(i3?.code).toBe("INTEGRITY_FAIL");
  });
});

// ---------------------------------------------------------------------------
// Sad path 2 — invalid performative
// ---------------------------------------------------------------------------

describe("envelopeVerify — schema (E-gate) failures", () => {
  it("sad path 2: invalid performative → ok: false, E-4 failure, phase: ts-ajv", async () => {
    const envelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Bad performative test.",
    });

    // Replace performative with an invalid value.
    const bad = { ...envelope, performative: "INVALID_PERF" };
    const badPath = path.join(tmpDir, "bad-perf.envelope.json");
    fs.writeFileSync(badPath, `${JSON.stringify(bad, null, 2)}\n`, "utf8");

    const result = await envelopeVerify({
      envelope: badPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    expect(result.ok).toBe(false);
    const e4 = result.failures.find((f) => f.gate === "E-4" || f.gate.startsWith("E-"));
    expect(e4).toBeDefined();
    expect(e4?.phase).toBe("ts-ajv");
    expect(e4?.code).toBe("SCHEMA_MISMATCH");
  });

  it("missing required field (e.g. objective) → ok: false, E-2 failure", async () => {
    const envelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Missing field test.",
    });

    const { objective: _removed, ...noObjective } = envelope as Record<string, unknown>;
    const badPath = path.join(tmpDir, "no-objective.envelope.json");
    fs.writeFileSync(badPath, `${JSON.stringify(noObjective, null, 2)}\n`, "utf8");

    const result = await envelopeVerify({
      envelope: badPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    expect(result.ok).toBe(false);
    const e2 = result.failures.find((f) => f.gate === "E-2");
    expect(e2).toBeDefined();
    expect(e2?.phase).toBe("ts-ajv");
  });
});

// ---------------------------------------------------------------------------
// Sad path 3 — malformed JSON
// ---------------------------------------------------------------------------

describe("envelopeVerify — I/O failures", () => {
  it("sad path 3: malformed JSON file → throws EclError with code IO_FAILED", async () => {
    const badJsonPath = path.join(tmpDir, "malformed.envelope.json");
    fs.writeFileSync(badJsonPath, "{ not valid json at all", "utf8");

    await expect(
      envelopeVerify({
        envelope: badJsonPath,
        schemas: schemasDir,
        contracts: contractsDir,
        skipShellGates: true,
      })
    ).rejects.toMatchObject({ code: "IO_FAILED" });
  });

  it("sad path 4: missing envelope file → throws EclError with code IO_FAILED", async () => {
    await expect(
      envelopeVerify({
        envelope: path.join(tmpDir, "does-not-exist.envelope.json"),
        schemas: schemasDir,
        contracts: contractsDir,
        skipShellGates: true,
      })
    ).rejects.toMatchObject({ code: "IO_FAILED" });
  });

  it("missing artifact (co-located not found) → I-2 failure in failures array", async () => {
    // Build an envelope referencing a now-deleted artifact.
    const tempArtifact = path.join(tmpDir, "temp-artifact.md");
    fs.writeFileSync(tempArtifact, FIXTURE_CONTENT, "utf8");

    const envelope = await envelopeBuild({
      artifact: tempArtifact,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Artifact will be deleted.",
    });

    const envelopePath2 = path.join(tmpDir, "temp-artifact.md.envelope.json");
    fs.writeFileSync(envelopePath2, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

    // Delete the artifact after building the envelope.
    fs.rmSync(tempArtifact);

    const result = await envelopeVerify({
      envelope: envelopePath2,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    expect(result.ok).toBe(false);
    const i2 = result.failures.find((f) => f.gate === "I-2");
    expect(i2).toBeDefined();
    expect(i2?.phase).toBe("ts-ajv");
  });
});

// ---------------------------------------------------------------------------
// HMAC path
// ---------------------------------------------------------------------------

describe("envelopeVerify — HMAC-SHA-256 integrity", () => {
  it("hmac-sha256 passes when ECL_HMAC_KEY is set and integrity matches", async () => {
    process.env.ECL_HMAC_KEY = "test-secret-key-s3";

    const hmacEnvelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "HMAC verify test.",
      integrityMethod: "hmac-sha256",
    });

    const hmacEnvelopePath = path.join(tmpDir, "hmac.envelope.json");
    fs.writeFileSync(hmacEnvelopePath, `${JSON.stringify(hmacEnvelope, null, 2)}\n`, "utf8");

    const result = await envelopeVerify({
      envelope: hmacEnvelopePath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    // Expect no I-3 failure.
    const i3fail = result.failures.find((f) => f.gate === "I-3");
    expect(i3fail).toBeUndefined();
  });

  it("hmac-sha256: ECL_HMAC_KEY unset → I-3 warn (not fail) per §6.2.3", async () => {
    const savedKey = process.env.ECL_HMAC_KEY;
    delete process.env.ECL_HMAC_KEY;

    // Build with a known key.
    process.env.ECL_HMAC_KEY = "temp-key-for-build";
    const hmacEnvelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "HMAC warn test.",
      integrityMethod: "hmac-sha256",
    });
    delete process.env.ECL_HMAC_KEY;

    const hmacEnvelopePath = path.join(tmpDir, "hmac-warn.envelope.json");
    fs.writeFileSync(hmacEnvelopePath, `${JSON.stringify(hmacEnvelope, null, 2)}\n`, "utf8");

    const result = await envelopeVerify({
      envelope: hmacEnvelopePath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    // Should produce a warning, not a failure, for HMAC key absence.
    const i3warn = result.warnings.find((w) => w.gate === "I-3");
    expect(i3warn).toBeDefined();
    // No I-3 failure.
    const i3fail = result.failures.find((f) => f.gate === "I-3");
    expect(i3fail).toBeUndefined();

    if (savedKey !== undefined) process.env.ECL_HMAC_KEY = savedKey;
  });
});

// ---------------------------------------------------------------------------
// skipShellGates: true → no C-/D- results
// ---------------------------------------------------------------------------

describe("envelopeVerify — skipShellGates", () => {
  it("skipShellGates: true → all returned failures are phase: ts-ajv", async () => {
    const result = await envelopeVerify({
      envelope: validEnvelopePath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    const bashPhase = result.failures.filter((f) => f.phase === "bash-checker");
    expect(bashPhase).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Shell-out smoke test (skipShellGates: false — requires bash in env)
// ---------------------------------------------------------------------------

// DC-3 closure (DECISION-S5 / v2.0.0): conformance/lib/handoff-graph.sh already
// reads `.from.eidolon` (line 70) — the slug-string vs agentRef drift is resolved
// on the bash side. Un-skipped as part of the v2.0 phase2c work.
//
// Note: these tests require bash + jq to be available (provided by the dev container
// Dockerfile.dev). They skip gracefully when either tool is absent — run via
// `make test` (docker compose) to exercise the full suite.
describe("envelopeVerify — shell-out phase", () => {
  /** Returns true when bash + jq are available on the PATH. */
  function hasBashAndJq(): boolean {
    try {
      const b = spawnSync("bash", ["--version"], { stdio: "ignore" });
      const j = spawnSync("jq", ["--version"], { stdio: "ignore" });
      return b.status === 0 && j.status === 0;
    } catch {
      return false;
    }
  }

  it(
    "skipShellGates: false invokes bash and returns results for a valid envelope",
    { timeout: 30_000 },
    async () => {
      // The atlas-to-spectra contract doesn't live in our tmpDir — we use
      // the real contracts dir so the shell-out checker can find the edge.
      // The envelope's from/to must match the atlas→spectra contract exactly.
      // Use the valid envelope from beforeAll (which uses atlas→spectra).

      // Check bash + jq are available; skip gracefully in environments
      // where the dev container is not running.
      const checkScript = (() => {
        const dir = repoRoot;
        const candidate = path.join(dir, "conformance", "check.sh");
        return fs.existsSync(candidate) ? candidate : null;
      })();

      if (!checkScript || !hasBashAndJq()) {
        // Skip gracefully; parent CI runs make check inside the container.
        console.warn("conformance/check.sh or bash/jq not found; skipping shell-out smoke test.");
        return;
      }

      const result = await envelopeVerify({
        envelope: validEnvelopePath,
        schemas: schemasDir,
        contracts: contractsDir,
        skipShellGates: false,
      });

      // The envelope is valid so we expect ok: true overall.
      // At minimum, there should be no hard C- or D- failures for a well-formed envelope.
      // (The bash checker may produce warnings for SHOULD-level items.)
      const cdFailures = result.failures.filter(
        (f) => f.gate.startsWith("C-") || f.gate.startsWith("D-")
      );
      // With a valid atlas→spectra envelope against the real contracts dir,
      // C- gates should pass.
      expect(cdFailures).toHaveLength(0);
    }
  );

  it("shell-out C-gate failure surfaces when performative is not in contract", async () => {
    // Use a real envelope with a performative that is not in the atlas→spectra contract.
    // atlas→spectra allows PROPOSE, INFORM, REFUSE — use REQUEST which is not allowed.
    const envelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "REQUEST",
      objective: "Trigger C-2 failure via shell-out.",
    });

    // Force performative into the envelope (bypass envelopeBuild validation since
    // it would reject REQUEST — we need to inject it directly).
    const modified = { ...envelope, performative: "REQUEST" };
    const modPath = path.join(tmpDir, "request-perf.envelope.json");
    fs.writeFileSync(modPath, `${JSON.stringify(modified, null, 2)}\n`, "utf8");

    const checkScript = path.join(repoRoot, "conformance", "check.sh");
    if (!fs.existsSync(checkScript) || !hasBashAndJq()) {
      console.warn("conformance/check.sh or bash/jq not found; skipping C-gate shell-out test.");
      return;
    }

    const result = await envelopeVerify({
      envelope: modPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: false,
    });

    expect(result.ok).toBe(false);
    const c2 = result.failures.find((f) => f.gate === "C-2");
    expect(c2).toBeDefined();
    expect(c2?.phase).toBe("bash-checker");
    expect(c2?.code).toBe("PERFORMATIVE_NOT_ALLOWED");
  });
});

// ---------------------------------------------------------------------------
// Trace integration (GAP-6)
// ---------------------------------------------------------------------------

describe("envelopeVerify — trace integration", () => {
  it("writes verify_pass event to traceDir when envelope is valid", async () => {
    const traceDir = path.join(tmpDir, "trace-pass");

    const result = await envelopeVerify({
      envelope: validEnvelopePath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
      traceDir,
    });

    expect(result.ok).toBe(true);

    // Find the JSONL trace file (named after the thread_id).
    const files = fs.readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBe(1);

    const lines = fs
      .readFileSync(path.join(traceDir, files[0]), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBe(1);

    const event = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(event.event).toBe("verify_pass");
    expect(event.performative).toBe("PROPOSE");
  });

  it("writes verify_fail event to traceDir when integrity is corrupted", async () => {
    const traceDir = path.join(tmpDir, "trace-fail");

    const envelope = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Fail trace test.",
    });

    const original = envelope.integrity.value;
    const mutated = original.slice(0, -1) + (original.endsWith("0") ? "1" : "0");
    const corrupted = {
      ...envelope,
      integrity: { ...envelope.integrity, value: mutated },
      artifact: { ...envelope.artifact, sha256: mutated },
    };

    const corruptedPath = path.join(tmpDir, "fail-trace.envelope.json");
    fs.writeFileSync(corruptedPath, `${JSON.stringify(corrupted, null, 2)}\n`, "utf8");

    await envelopeVerify({
      envelope: corruptedPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
      traceDir,
    });

    const files = fs.readdirSync(traceDir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBe(1);

    const lines = fs
      .readFileSync(path.join(traceDir, files[0]), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBe(1);

    const event = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(event.event).toBe("verify_fail");
    expect(typeof event.verify_failure_code).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// I-5 (ECL v1.1 §6.2.6) — HMAC RECOMMENDED at trust_level=high
// ---------------------------------------------------------------------------

describe("envelopeVerify — I-5 (HMAC recommended at high trust)", () => {
  /** Build a fresh envelope and force its `constraints.trust_level`. */
  async function buildEnvelopeWithTrust(
    trustLevel: "low" | "standard" | "high",
    integrityMethod: "sha256" | "hmac-sha256"
  ): Promise<string> {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "I-5 fixture.",
      integrityMethod,
    });
    // Force the trust_level on the envelope (envelopeBuild defaults from contract).
    env.constraints = { ...env.constraints, trust_level: trustLevel };
    const envPath = path.join(tmpDir, `i5-${trustLevel}-${integrityMethod}.envelope.json`);
    fs.writeFileSync(envPath, `${JSON.stringify(env, null, 2)}\n`, "utf8");
    return envPath;
  }

  it("emits I-5 warning when trust_level=high AND integrity.method=sha256", async () => {
    const envPath = await buildEnvelopeWithTrust("high", "sha256");
    const result = await envelopeVerify({
      envelope: envPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });
    // SHOULD-level warn → ok stays true; failures empty for E-/I- gates.
    const i5 = result.warnings.find((w) => w.gate === "I-5");
    expect(i5).toBeDefined();
    expect(i5?.message).toMatch(/RECOMMENDED hmac-sha256/);
  });

  it("does NOT emit I-5 when trust_level=high AND integrity.method=hmac-sha256", async () => {
    process.env.ECL_HMAC_KEY = "test-key-for-i5";
    try {
      const envPath = await buildEnvelopeWithTrust("high", "hmac-sha256");
      const result = await envelopeVerify({
        envelope: envPath,
        schemas: schemasDir,
        contracts: contractsDir,
        skipShellGates: true,
      });
      const i5 = result.warnings.find((w) => w.gate === "I-5");
      expect(i5).toBeUndefined();
    } finally {
      delete process.env.ECL_HMAC_KEY;
    }
  });

  it("does NOT emit I-5 at trust_level=standard with sha256", async () => {
    const envPath = await buildEnvelopeWithTrust("standard", "sha256");
    const result = await envelopeVerify({
      envelope: envPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });
    const i5 = result.warnings.find((w) => w.gate === "I-5");
    expect(i5).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Explicit artifact override
// ---------------------------------------------------------------------------

describe("envelopeVerify — explicit artifact override", () => {
  it("accepts an explicit artifact path that overrides co-located lookup", async () => {
    // Create an artifact in a different directory from the envelope.
    const altDir = path.join(tmpDir, "alt-artifact-dir");
    fs.mkdirSync(altDir, { recursive: true });
    const altArtifact = path.join(altDir, "scout-report.md");
    fs.writeFileSync(altArtifact, FIXTURE_CONTENT, "utf8");

    // The envelope's artifact.path won't co-locate with the envelope in altDir,
    // but we pass it explicitly.
    const result = await envelopeVerify({
      envelope: validEnvelopePath,
      artifact: altArtifact,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    // Same bytes → integrity should pass.
    const i3fail = result.failures.find((f) => f.gate === "I-3");
    expect(i3fail).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// S-3 (ECL v2.0 §6.5.5) — ISE RECOMMENDED at trust_level=high
// ---------------------------------------------------------------------------

describe("envelopeVerify — S-3 (ISE recommended at high trust)", () => {
  /** Build an envelope with the given trust level, optional ISE block. */
  async function buildEnvelopeWithIse(
    trustLevel: "low" | "standard" | "high",
    ise?: {
      assertion_grade: "unverified" | "self-attested" | "validated" | "human-reviewed";
    }
  ): Promise<string> {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "S-3 fixture.",
      ise,
    });
    // Force the trust_level on the envelope.
    env.constraints = { ...env.constraints, trust_level: trustLevel };
    const suffix = `${trustLevel}-${ise ? "ise" : "no-ise"}`;
    const envPath = path.join(tmpDir, `s3-${suffix}.envelope.json`);
    fs.writeFileSync(envPath, `${JSON.stringify(env, null, 2)}\n`, "utf8");
    return envPath;
  }

  it("emits S-3 warning when trust_level=high AND ise block absent", async () => {
    const envPath = await buildEnvelopeWithIse("high", undefined);
    const result = await envelopeVerify({
      envelope: envPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });
    // SHOULD-level warn → ok stays true for E-/I- gates.
    const s3 = result.warnings.find((w) => w.gate === "S-3");
    expect(s3).toBeDefined();
    expect(s3?.message).toMatch(/ISE trust hierarchy/);
  });

  it("does NOT emit S-3 when trust_level=high AND ise block present", async () => {
    const envPath = await buildEnvelopeWithIse("high", { assertion_grade: "self-attested" });
    const result = await envelopeVerify({
      envelope: envPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });
    const s3 = result.warnings.find((w) => w.gate === "S-3");
    expect(s3).toBeUndefined();
  });

  it("does NOT emit S-3 at trust_level=standard without ise", async () => {
    const envPath = await buildEnvelopeWithIse("standard", undefined);
    const result = await envelopeVerify({
      envelope: envPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });
    const s3 = result.warnings.find((w) => w.gate === "S-3");
    expect(s3).toBeUndefined();
  });

  it("v2.0 envelope with full ISE block validates schema and has no S-3 warning", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Full ISE v2.0 fixture.",
      ise: {
        assertion_grade: "validated",
        provenance: {
          methodology_version: "spectra-4.3.1",
          tool_surface: ["Read", "Bash"],
          lateral_consults: [{ eidolon: "atlas", performative: "REQUEST" }],
        },
        receiver_authorization: {
          auto_route: true,
          auto_merge: false,
          auto_deploy: false,
        },
      },
    });
    env.constraints = { ...env.constraints, trust_level: "high" };
    const envPath = path.join(tmpDir, "s3-full-ise-v2.envelope.json");
    fs.writeFileSync(envPath, `${JSON.stringify(env, null, 2)}\n`, "utf8");

    const result = await envelopeVerify({
      envelope: envPath,
      schemas: schemasDir,
      contracts: contractsDir,
      skipShellGates: true,
    });

    // Schema validates; no S-3 warning since ise is present.
    const schemaFailures = result.failures.filter((f) => f.gate.startsWith("E-"));
    expect(schemaFailures).toHaveLength(0);
    const s3 = result.warnings.find((w) => w.gate === "S-3");
    expect(s3).toBeUndefined();
    // The envelope_version should be 2.0.
    expect(env.envelope_version).toBe("2.0");
  });
});
