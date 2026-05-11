/**
 * Tests for handoffEmit — Story S4.
 *
 * Coverage targets (G-S4-Unit):
 *   - Happy path: emit writes sidecar AND trace event; result paths are correct.
 *   - Sidecar content matches `JSON.stringify(envelope, null, 2) + "\n"`.
 *   - Trace event has all required fields per schemas/handoff-event.v1.json.
 *   - Trace dir auto-creation when missing.
 *   - Overwrite behaviour: emit a second time overwrites the sidecar.
 *   - Round-trip with traceTail: emit one event, traceTail picks it up.
 *   - envelopeBuild error paths propagate (invalid performative → USAGE).
 *   - Missing artifact path → USAGE error.
 *   - context_tokens populated from envelope when context_delta.tokens_used set.
 *   - integrity_method propagated correctly for sha256 path.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EclError } from "./errors.js";
import { handoffEmit } from "./handoffEmit.js";
import { traceTail } from "./traceTail.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const FIXTURE_CONTENT = "hello world\n";

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
let traceDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ecl-emit-test-"));
  artifactPath = path.join(tmpDir, "scout-report.md");
  contractPath = path.join(tmpDir, "atlas-to-spectra.yaml");
  traceDir = path.join(tmpDir, "trace");
  fs.writeFileSync(artifactPath, FIXTURE_CONTENT, "utf8");
  fs.writeFileSync(contractPath, MINIMAL_CONTRACT_YAML, "utf8");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("handoffEmit — happy path", () => {
  it("writes envelope sidecar next to the artifact + trace JSONL", async () => {
    const localTrace = path.join(tmpDir, "trace-happy");
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Hand off scout-report for planning.",
      traceDir: localTrace,
    });

    expect(result.envelopePath).toBe(`${artifactPath}.envelope.json`);
    expect(result.tracePath).toBe(path.join(localTrace, `${result.envelope.thread_id}.jsonl`));
    expect(fs.existsSync(result.envelopePath)).toBe(true);
    expect(fs.existsSync(result.tracePath)).toBe(true);
  });

  it("returned envelope object matches the serialized sidecar (round-trip)", async () => {
    const localTrace = path.join(tmpDir, "trace-roundtrip");
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "INFORM",
      objective: "Round-trip parity check.",
      traceDir: localTrace,
    });

    const onDisk = JSON.parse(fs.readFileSync(result.envelopePath, "utf8"));
    expect(onDisk.message_id).toBe(result.envelope.message_id);
    expect(onDisk.thread_id).toBe(result.envelope.thread_id);
    expect(onDisk.performative).toBe("INFORM");
  });

  it("sidecar content is JSON.stringify(envelope, null, 2) + newline", async () => {
    const localTrace = path.join(tmpDir, "trace-stringify");
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Sidecar format check.",
      traceDir: localTrace,
    });

    const raw = fs.readFileSync(result.envelopePath, "utf8");
    const expected = `${JSON.stringify(result.envelope, null, 2)}\n`;
    expect(raw).toBe(expected);
    expect(raw.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trace event shape (per handoff-event.v1.json)
// ---------------------------------------------------------------------------

describe("handoffEmit — trace event shape", () => {
  it("trace line is valid JSON ending with a single newline", async () => {
    const localTrace = path.join(tmpDir, "trace-shape");
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Trace line shape check.",
      traceDir: localTrace,
    });

    const raw = fs.readFileSync(result.tracePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const lines = raw.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event.event).toBe("emit");
  });

  it("trace event has all required fields per schemas/handoff-event.v1.json", async () => {
    const localTrace = path.join(tmpDir, "trace-required");
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Required-field check.",
      traceDir: localTrace,
    });

    const event = JSON.parse(fs.readFileSync(result.tracePath, "utf8").trim());
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(event.event).toBe("emit");
    expect(event.message_id).toBe(result.envelope.message_id);
    expect(event.thread_id).toBe(result.envelope.thread_id);
    expect(event.from).toMatch(/^atlas@/);
    expect(event.to).toMatch(/^spectra@/);
    expect(event.performative).toBe("PROPOSE");
    expect(event.integrity_method).toBe("sha256");
  });

  it("trace event includes optional context_tokens, model, tier", async () => {
    const localTrace = path.join(tmpDir, "trace-optional");
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Optional-fields check.",
      tokensUsed: 1234,
      model: "claude-sonnet-4-6",
      tier: "trance",
      traceDir: localTrace,
    });

    const event = JSON.parse(fs.readFileSync(result.tracePath, "utf8").trim());
    expect(event.context_tokens).toBe(1234);
    expect(event.model).toBe("claude-sonnet-4-6");
    expect(event.tier).toBe("trance");
  });
});

// ---------------------------------------------------------------------------
// Trace dir auto-creation
// ---------------------------------------------------------------------------

describe("handoffEmit — trace dir auto-creation", () => {
  it("creates nested traceDir when missing (recursive mkdir)", async () => {
    const nested = path.join(tmpDir, "deep", "nested", "trace");
    expect(fs.existsSync(nested)).toBe(false);
    const result = await handoffEmit({
      artifact: artifactPath,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Auto-mkdir check.",
      traceDir: nested,
    });
    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.existsSync(result.tracePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Overwrite behaviour
// ---------------------------------------------------------------------------

describe("handoffEmit — overwrite", () => {
  it("emitting twice overwrites the sidecar (matches bash behaviour)", async () => {
    const localArtifact = path.join(tmpDir, "overwrite-artifact.md");
    fs.writeFileSync(localArtifact, "v1 content\n", "utf8");
    const localTrace = path.join(tmpDir, "trace-overwrite");

    const first = await handoffEmit({
      artifact: localArtifact,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "First emit.",
      traceDir: localTrace,
    });

    fs.writeFileSync(localArtifact, "v2 content\n", "utf8");

    const second = await handoffEmit({
      artifact: localArtifact,
      contract: contractPath,
      performative: "INFORM",
      objective: "Second emit (overwrites first).",
      traceDir: localTrace,
    });

    // Sidecar reflects the SECOND envelope, not the first.
    const onDisk = JSON.parse(fs.readFileSync(second.envelopePath, "utf8"));
    expect(onDisk.message_id).toBe(second.envelope.message_id);
    expect(onDisk.message_id).not.toBe(first.envelope.message_id);
    expect(onDisk.performative).toBe("INFORM");
  });

  it("appends a second trace line (does NOT overwrite the JSONL)", async () => {
    const localArtifact = path.join(tmpDir, "trace-append-artifact.md");
    fs.writeFileSync(localArtifact, "content\n", "utf8");
    const localTrace = path.join(tmpDir, "trace-append");

    // Use the same threadId so both events land in the same JSONL file.
    const sharedThread = "01926e3a-2c8a-7b04-b3a1-1cf0a7a6d5e1";

    await handoffEmit({
      artifact: localArtifact,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "First emit shares thread.",
      threadId: sharedThread,
      traceDir: localTrace,
    });
    await handoffEmit({
      artifact: localArtifact,
      contract: contractPath,
      performative: "INFORM",
      objective: "Second emit shares thread.",
      threadId: sharedThread,
      traceDir: localTrace,
    });

    const tracePath = path.join(localTrace, `${sharedThread}.jsonl`);
    const raw = fs.readFileSync(tracePath, "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const e1 = JSON.parse(lines[0]);
    const e2 = JSON.parse(lines[1]);
    expect(e1.performative).toBe("PROPOSE");
    expect(e2.performative).toBe("INFORM");
  });
});

// ---------------------------------------------------------------------------
// Round-trip with traceTail (G-S4-RoundTrip)
// ---------------------------------------------------------------------------

describe("handoffEmit — round-trip with traceTail", () => {
  it("emit one event; traceTail picks it up", async () => {
    const localArtifact = path.join(tmpDir, "roundtrip-artifact.md");
    fs.writeFileSync(localArtifact, "rt content\n", "utf8");
    const localTrace = path.join(tmpDir, "trace-rt");

    const result = await handoffEmit({
      artifact: localArtifact,
      contract: contractPath,
      performative: "PROPOSE",
      objective: "Round-trip emit + tail.",
      traceDir: localTrace,
    });

    const events: unknown[] = [];
    for await (const ev of traceTail({
      traceDir: localTrace,
      thread: result.envelope.thread_id,
    })) {
      events.push(ev);
    }
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe("handoffEmit — error paths", () => {
  it("missing artifact throws USAGE before any disk write", async () => {
    await expect(
      handoffEmit({
        artifact: "",
        contract: contractPath,
        performative: "PROPOSE",
        objective: "Should not reach build.",
        traceDir: path.join(tmpDir, "trace-err1"),
      })
    ).rejects.toMatchObject({ code: "USAGE" });
  });

  it("envelopeBuild errors propagate (invalid performative)", async () => {
    await expect(
      handoffEmit({
        artifact: artifactPath,
        contract: contractPath,
        // biome-ignore lint/suspicious/noExplicitAny: deliberate invalid performative cast for error-path test
        performative: "BOGUS" as any,
        objective: "Invalid performative test.",
        traceDir: path.join(tmpDir, "trace-err2"),
      })
    ).rejects.toBeInstanceOf(EclError);
  });

  it("objective over 240 chars propagates as USAGE", async () => {
    await expect(
      handoffEmit({
        artifact: artifactPath,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "x".repeat(241),
        traceDir: path.join(tmpDir, "trace-err3"),
      })
    ).rejects.toMatchObject({ code: "USAGE" });
  });
});

// ---------------------------------------------------------------------------
// Default traceDir
// ---------------------------------------------------------------------------

describe("handoffEmit — default traceDir", () => {
  it("defaults traceDir to .eidolons/.trace under process.cwd when not supplied", async () => {
    // Run in a clean cwd to avoid polluting the repo root's trace dir.
    const savedCwd = process.cwd();
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "ecl-emit-cwd-"));
    process.chdir(sandbox);
    try {
      const localArtifact = path.join(sandbox, "cwd-artifact.md");
      fs.writeFileSync(localArtifact, "cwd content\n", "utf8");
      const result = await handoffEmit({
        artifact: localArtifact,
        contract: contractPath,
        performative: "PROPOSE",
        objective: "Default traceDir check.",
      });
      expect(result.tracePath).toContain(path.join(".eidolons", ".trace"));
      expect(fs.existsSync(result.tracePath)).toBe(true);
    } finally {
      process.chdir(savedCwd);
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
