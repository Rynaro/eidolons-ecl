/**
 * Tests for envelopeBuild — Story S2.
 *
 * Coverage targets (G-S2-Unit):
 *   - Minimal valid call returns a structurally-correct Envelope.
 *   - SHA-256 integrity.value matches byte-equivalent bash output.
 *   - messageId / threadId are valid UUIDs; threadId defaults to messageId.
 *   - Contract-derived defaults: tokenBudget from contract, kind from contract.
 *   - HMAC path throws USAGE when ECL_HMAC_KEY is unset.
 *   - Invalid performative throws USAGE.
 *   - Missing required option throws USAGE.
 *   - Unreadable artifact throws IO_FAILED.
 *   - Unparseable contract throws IO_FAILED.
 *   - Explicit overrides (all optional flags) are honoured.
 *   - parent_id defaults to null; can be overridden with a UUID string.
 *   - objective > 240 chars throws USAGE.
 *   - integrityMethod=sha256 produces lowercase hex ^[0-9a-f]{64}$.
 *   - artifact.sha256 === integrity.value (ATLAS F-7.3).
 *   - Key ordering in output object matches spec (envelope_version first, trace last).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envelopeBuild } from "./envelopeBuild.js";
import { EclError } from "./errors.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** A minimal contract YAML that mirrors contracts/atlas-to-spectra.yaml shape. */
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

/** A contract YAML without optional fields (tests defaults). */
const SPARSE_CONTRACT_YAML = `
contract_version: "1.0"
from: atlas
to: spectra
edge_origin: roster
performatives_allowed:
  - PROPOSE
artifacts:
  - kind: scout-report
`.trimStart();

let tmpDir: string;
let artifactPath: string;
let contractPath: string;
let sparseContractPath: string;

// SHA-256 of the fixture artifact content (computed externally for parity
// verification — matches `shasum -a 256 <file> | awk '{print $1}'`).
// Content: "hello world\n" (12 bytes)
const FIXTURE_CONTENT = "hello world\n";
const FIXTURE_SHA256 = "a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecl-test-"));
  artifactPath = path.join(tmpDir, "fixture.md");
  contractPath = path.join(tmpDir, "atlas-to-spectra.yaml");
  sparseContractPath = path.join(tmpDir, "sparse.yaml");

  fs.writeFileSync(artifactPath, FIXTURE_CONTENT, "utf8");
  fs.writeFileSync(contractPath, MINIMAL_CONTRACT_YAML, "utf8");
  fs.writeFileSync(sparseContractPath, SPARSE_CONTRACT_YAML, "utf8");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Core shape
// ---------------------------------------------------------------------------

describe("envelopeBuild — core shape", () => {
  it("returns an Envelope with all required top-level keys", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Hand off scout report.",
    });

    expect(env.envelope_version).toBe("2.0");
    expect(env.performative).toBe("PROPOSE");
    expect(env.objective).toBe("Hand off scout report.");
    expect(env.from).toEqual({ eidolon: "atlas", version: "0.0.0" });
    expect(env.to).toEqual({ eidolon: "spectra", version: "0.0.0" });
    expect(env.edge_origin).toBe("roster");
    expect(env.parent_id).toBeNull();
    expect(env.artifact.kind).toBe("scout-report");
    expect(env.artifact.schema_version).toBe("2.0");
    expect(env.artifact.path).toBe("fixture.md");
    expect(env.artifact.size_bytes).toBe(Buffer.byteLength(FIXTURE_CONTENT));
    expect(env.constraints).toEqual({ trust_level: "standard" });
    expect(env.confidence).toBe(0.5);
    expect(env.integrity.method).toBe("sha256");
    expect(env.trace.tier).toBe("standard");
  });

  it("artifact.sha256 equals integrity.value (ATLAS F-7.3)", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Test parity.",
    });
    expect(env.artifact.sha256).toBe(env.integrity.value);
  });

  it("key order matches bash jq output: envelope_version first, trace last", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Test key order.",
    });
    const keys = Object.keys(env);
    expect(keys[0]).toBe("envelope_version");
    expect(keys[keys.length - 1]).toBe("trace");
    // Spot-check canonical order
    const canonicalOrder = [
      "envelope_version",
      "message_id",
      "thread_id",
      "parent_id",
      "from",
      "to",
      "performative",
      "edge_origin",
      "objective",
      "artifact",
      "context_delta",
      "constraints",
      "confidence",
      "integrity",
      "trace",
    ];
    expect(keys).toEqual(canonicalOrder);
  });
});

// ---------------------------------------------------------------------------
// Integrity: SHA-256 byte equivalence
// ---------------------------------------------------------------------------

describe("envelopeBuild — integrity", () => {
  it("sha256 integrity.value matches shasum -a 256 output for fixture file", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Test sha256.",
    });
    expect(env.integrity.value).toBe(FIXTURE_SHA256);
    expect(env.integrity.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256 is independent of file extension / name", async () => {
    // Create a second identical file with a different name
    const altPath = path.join(tmpDir, "alt-artifact.txt");
    fs.writeFileSync(altPath, FIXTURE_CONTENT, "utf8");

    const env = await envelopeBuild({
      artifact: altPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Test sha256 alt.",
    });
    expect(env.integrity.value).toBe(FIXTURE_SHA256);
  });

  it("sha256 changes when artifact content changes", async () => {
    const altPath = path.join(tmpDir, "different.md");
    fs.writeFileSync(altPath, "different content", "utf8");

    const env = await envelopeBuild({
      artifact: altPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Test sha256 diff.",
    });
    expect(env.integrity.value).not.toBe(FIXTURE_SHA256);
    expect(env.integrity.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256 matches Node crypto.createHash output for same bytes", async () => {
    const buf = fs.readFileSync(artifactPath);
    const expected = crypto.createHash("sha256").update(buf).digest("hex");

    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Test node crypto parity.",
    });
    expect(env.integrity.value).toBe(expected);
  });

  it("hmac-sha256 throws USAGE when ECL_HMAC_KEY is unset", async () => {
    const savedKey = process.env.ECL_HMAC_KEY;
    delete process.env.ECL_HMAC_KEY;

    try {
      await expect(
        envelopeBuild({
          artifact: artifactPath,
          contract: contractPath,
          performative: "PROPOSE",
          objective: "Test hmac no key.",
          integrityMethod: "hmac-sha256",
        })
      ).rejects.toMatchObject({ code: "USAGE" });
    } finally {
      if (savedKey !== undefined) process.env.ECL_HMAC_KEY = savedKey;
    }
  });

  it("hmac-sha256 produces a valid 64-char hex digest when ECL_HMAC_KEY is set", async () => {
    const savedKey = process.env.ECL_HMAC_KEY;
    process.env.ECL_HMAC_KEY = "test-secret-key";

    try {
      const env = await envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "Test hmac with key.",
        integrityMethod: "hmac-sha256",
      });
      expect(env.integrity.method).toBe("hmac-sha256");
      expect(env.integrity.value).toMatch(/^[0-9a-f]{64}$/);
      // HMAC value must differ from plain SHA-256
      expect(env.integrity.value).not.toBe(FIXTURE_SHA256);
    } finally {
      if (savedKey !== undefined) process.env.ECL_HMAC_KEY = savedKey;
      else delete process.env.ECL_HMAC_KEY;
    }
  });
});

// ---------------------------------------------------------------------------
// UUID defaults
// ---------------------------------------------------------------------------

describe("envelopeBuild — UUID defaults", () => {
  it("messageId is a valid UUID", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "UUID test.",
    });
    expect(env.message_id).toMatch(UUID_RE);
  });

  it("threadId defaults to messageId when not supplied", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "ThreadId default test.",
    });
    expect(env.thread_id).toBe(env.message_id);
  });

  it("threadId can be set independently of messageId", async () => {
    const fixedThread = "01234567-89ab-7def-8012-3456789abcde";
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Independent threadId test.",
      threadId: fixedThread,
    });
    expect(env.thread_id).toBe(fixedThread);
    expect(env.message_id).not.toBe(fixedThread);
  });

  it("explicit messageId and threadId are preserved", async () => {
    const mid = "01234567-89ab-7cde-8012-3456789abcde";
    const tid = "fedcba98-7654-7321-8fed-cba987654321";
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Explicit IDs.",
      messageId: mid,
      threadId: tid,
    });
    expect(env.message_id).toBe(mid);
    expect(env.thread_id).toBe(tid);
  });
});

// ---------------------------------------------------------------------------
// Contract-derived defaults
// ---------------------------------------------------------------------------

describe("envelopeBuild — contract-derived defaults", () => {
  it("tokenBudget comes from contract.context_delta.token_budget_max", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Token budget from contract.",
    });
    // context_delta.v1.json uses `token_budget` as the key in the output.
    // types.ts ContextDelta has `token_budget_max` (S1 drift); cast to access.
    expect((env.context_delta as unknown as Record<string, unknown>).token_budget).toBe(4000);
  });

  it("tokenBudget falls back to 4000 when contract has no context_delta", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: sparseContractPath,
      performative: "PROPOSE",
      objective: "Token budget fallback.",
    });
    expect((env.context_delta as unknown as Record<string, unknown>).token_budget).toBe(4000);
  });

  it("tokenBudget override takes precedence over contract", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Token budget override.",
      tokenBudget: 8000,
    });
    expect((env.context_delta as unknown as Record<string, unknown>).token_budget).toBe(8000);
  });

  it("kind comes from contract.artifacts[0].kind when not supplied", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Kind from contract.",
    });
    expect(env.artifact.kind).toBe("scout-report");
  });

  it("kind override takes precedence over contract", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Kind override.",
      kind: "custom-kind",
    });
    expect(env.artifact.kind).toBe("custom-kind");
  });

  it("trustLevel comes from contract.trust_level", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Trust level from contract.",
    });
    expect(env.constraints?.trust_level).toBe("standard");
  });

  it("trustLevel falls back to 'standard' when contract is silent", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: sparseContractPath,
      performative: "PROPOSE",
      objective: "Trust level fallback.",
    });
    expect(env.constraints?.trust_level).toBe("standard");
  });

  it("from/to/edge_origin come from the contract", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Edge from contract.",
    });
    expect(env.from.eidolon).toBe("atlas");
    expect(env.to.eidolon).toBe("spectra");
    expect(env.edge_origin).toBe("roster");
  });
});

// ---------------------------------------------------------------------------
// Optional overrides
// ---------------------------------------------------------------------------

describe("envelopeBuild — optional overrides", () => {
  it("fromVersion and toVersion are honoured", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Version override.",
      fromVersion: "1.4.2",
      toVersion: "4.2.11",
    });
    expect(env.from.version).toBe("1.4.2");
    expect(env.to.version).toBe("4.2.11");
  });

  it("summary override is stored in context_delta.summary", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Summary override.",
      summary: "Custom summary text.",
    });
    expect((env.context_delta as unknown as Record<string, unknown>).summary).toBe(
      "Custom summary text."
    );
  });

  it("tokensUsed override is stored in context_delta.tokens_used", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "tokensUsed override.",
      tokensUsed: 380,
    });
    expect((env.context_delta as unknown as Record<string, unknown>).tokens_used).toBe(380);
  });

  it("confidence override is stored", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Confidence override.",
      confidence: 0.92,
    });
    expect(env.confidence).toBe(0.92);
  });

  it("host override populates trace.host", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Host override.",
      host: "claude-code",
    });
    expect(env.trace.host).toBe("claude-code");
  });

  it("model override populates trace.model", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Model override.",
      model: "claude-sonnet-4-6",
    });
    expect(env.trace.model).toBe("claude-sonnet-4-6");
  });

  it("tier override populates trace.tier", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Tier override.",
      tier: "trance",
    });
    expect(env.trace.tier).toBe("trance");
  });

  it("parentId string is preserved in parent_id", async () => {
    const pid = "aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee";
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "ParentId test.",
      parentId: pid,
    });
    expect(env.parent_id).toBe(pid);
  });

  it("parentId null is preserved in parent_id as null", async () => {
    const env = await envelopeBuild({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "ParentId null test.",
      parentId: null,
    });
    expect(env.parent_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe("envelopeBuild — error paths", () => {
  it("throws USAGE when performative is not in the 10-value enum", async () => {
    await expect(
      envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        // @ts-expect-error — intentional invalid value for test
        performative: "INVALID_PERF",
        objective: "Invalid perf.",
      })
    ).rejects.toMatchObject({ code: "USAGE" });
  });

  it("throws USAGE when objective exceeds 240 chars", async () => {
    await expect(
      envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "x".repeat(241),
      })
    ).rejects.toMatchObject({ code: "USAGE" });
  });

  it("throws IO_FAILED when artifact path does not exist", async () => {
    await expect(
      envelopeBuild({
        artifact: path.join(tmpDir, "does-not-exist.md"),
        contract: contractPath,
        performative: "PROPOSE",
        objective: "Missing artifact.",
      })
    ).rejects.toMatchObject({ code: "IO_FAILED" });
  });

  it("throws IO_FAILED when contract path does not exist", async () => {
    await expect(
      envelopeBuild({
        artifact: artifactPath,
        contract: path.join(tmpDir, "missing-contract.yaml"),
        performative: "PROPOSE",
        objective: "Missing contract.",
      })
    ).rejects.toMatchObject({ code: "IO_FAILED" });
  });

  it("throws IO_FAILED when contract YAML is not valid YAML", async () => {
    const badContractPath = path.join(tmpDir, "bad-contract.yaml");
    fs.writeFileSync(badContractPath, "{ this is not: valid: yaml: }", "utf8");

    await expect(
      envelopeBuild({
        artifact: artifactPath,
        contract: badContractPath,
        performative: "PROPOSE",
        objective: "Bad contract yaml.",
      })
    ).rejects.toMatchObject({ code: "IO_FAILED" });
  });

  it("throws USAGE when artifact is missing", async () => {
    await expect(
      envelopeBuild({
        // @ts-expect-error — intentional missing required arg
        artifact: "",
        contract: contractPath,
        performative: "PROPOSE",
        objective: "Missing artifact opt.",
      })
    ).rejects.toMatchObject({ code: "USAGE" });
  });

  it("all 10 valid performatives are accepted", async () => {
    const perfs: string[] = [
      "REQUEST",
      "INFORM",
      "PROPOSE",
      "CRITIQUE",
      "DECIDE",
      "DELEGATE",
      "ACKNOWLEDGE",
      "ESCALATE",
      "RESUME",
      "REFUSE",
    ];
    for (const perf of perfs) {
      const env = await envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: perf as import("./types.js").Performative,
        objective: `Test performative ${perf}.`,
      });
      expect(env.performative).toBe(perf);
    }
  });
});

// ---------------------------------------------------------------------------
// ECL_HOST / ECL_MODEL env defaults
// ---------------------------------------------------------------------------

describe("envelopeBuild — environment defaults", () => {
  it("trace.host defaults to ECL_HOST env when set", async () => {
    const savedHost = process.env.ECL_HOST;
    process.env.ECL_HOST = "cursor";
    try {
      const env = await envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "ECL_HOST test.",
      });
      expect(env.trace.host).toBe("cursor");
    } finally {
      if (savedHost !== undefined) process.env.ECL_HOST = savedHost;
      else delete process.env.ECL_HOST;
    }
  });

  it("trace.host defaults to 'raw' when ECL_HOST is unset", async () => {
    const savedHost = process.env.ECL_HOST;
    delete process.env.ECL_HOST;
    try {
      const env = await envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "ECL_HOST unset test.",
      });
      expect(env.trace.host).toBe("raw");
    } finally {
      if (savedHost !== undefined) process.env.ECL_HOST = savedHost;
    }
  });

  it("trace.model defaults to ECL_MODEL env when set", async () => {
    const savedModel = process.env.ECL_MODEL;
    process.env.ECL_MODEL = "gpt-4o";
    try {
      const env = await envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "ECL_MODEL test.",
      });
      expect(env.trace.model).toBe("gpt-4o");
    } finally {
      if (savedModel !== undefined) process.env.ECL_MODEL = savedModel;
      else delete process.env.ECL_MODEL;
    }
  });

  it("trace.model defaults to 'unknown' when ECL_MODEL is unset", async () => {
    const savedModel = process.env.ECL_MODEL;
    delete process.env.ECL_MODEL;
    try {
      const env = await envelopeBuild({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "ECL_MODEL unset test.",
      });
      expect(env.trace.model).toBe("unknown");
    } finally {
      if (savedModel !== undefined) process.env.ECL_MODEL = savedModel;
    }
  });
});
