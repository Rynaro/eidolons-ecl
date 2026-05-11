/**
 * envelopeBuild — TypeScript port of reference-sdk/bash/envelope-build.sh.
 *
 * Builds a v1.0 ECL envelope from an artifact file and a contract YAML.
 * Returns the typed Envelope object; does NOT write to stdout or disk
 * (the bash helper prints to stdout; TS callers receive the object directly;
 * handoffEmit handles the sidecar write — Story S4).
 *
 * Bash parity notes:
 * - SHA-256 computed over raw artifact bytes (no transformation), matching
 *   `shasum -a 256 <artifact> | awk '{print $1}'` (ATLAS F-7.1).
 * - `artifact.sha256` and `integrity.value` are both set to this digest,
 *   matching bash lines 205 and 213 (ATLAS F-7.3).
 * - `artifact.path` = `path.basename(artifactPath)` — matches bash `:204`.
 * - `artifact.schema_version` is hardcoded to `"1.0"` — matches bash `:203`.
 * - `context_delta.token_budget` = resolved from contract or 4000 default.
 * - Key order in the output object matches the bash `jq -n` builder exactly
 *   (envelope-build.sh:218-245) to satisfy G-S2-Bash-Parity.
 * - UUID: upgraded from bash's UUIDv4 (`uuidgen`) to UUIDv7 (`uuidv7()`) per
 *   GAP-3. The schema validates `format: "uuid"` only — no version-bit check.
 * - Timestamp: seconds-precision RFC 3339 UTC (`YYYY-MM-DDTHH:MM:SSZ`),
 *   matching bash `date -u +"%Y-%m-%dT%H:%M:%SZ"`. Milliseconds are stripped.
 * - No schema validation at build time — validation is S3's job (ATLAS F-2.1).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { v7 as uuidv7 } from "uuid";
import { EclError } from "./errors.js";
import type {
  ContextDelta,
  Envelope,
  IntegrityMethod,
  Performative,
  Tier,
  TrustLevel,
} from "./types.js";

// ---------------------------------------------------------------------------
// Performative validation set (mirrors the 10-value enum)
// ---------------------------------------------------------------------------

const VALID_PERFORMATIVES = new Set<string>([
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
]);

// ---------------------------------------------------------------------------
// Raw contract shape (only fields consumed by envelopeBuild)
// ---------------------------------------------------------------------------

interface RawContract {
  from?: string;
  to?: string;
  edge_origin?: string;
  trust_level?: string;
  artifacts?: Array<{ kind?: string; schema_version?: string }>;
  context_delta?: { token_budget_max?: number };
}

// ---------------------------------------------------------------------------
// EnvelopeBuildOptions — mirrors the 22 bash flags 1:1 (camelCase)
// ---------------------------------------------------------------------------

export interface EnvelopeBuildOptions {
  // REQUIRED
  /** Path to the payload file (read as raw bytes). */
  artifact: string;
  /** Path to the contract YAML for this edge. */
  contract: string;
  /** One of the 10 ECL performatives. */
  performative: Performative;
  /** One-sentence goal (1–240 chars). */
  objective: string;

  // OPTIONAL — defaults match bash (envelope-build.sh:46-54, 119-136)
  /** Globally unique message ID. Default: uuidv7() (bash: uuidgen / UUIDv4). */
  messageId?: string;
  /** UUID grouping all envelopes of one mission. Default: same as messageId. */
  threadId?: string;
  /** Causal predecessor message_id, or null. Default: null. */
  parentId?: string | null;
  /** SemVer of the sending Eidolon. Default: "0.0.0". */
  fromVersion?: string;
  /** SemVer of the receiving Eidolon. Default: "0.0.0". */
  toVersion?: string;
  /** Artifact kind slug. Default: contract.artifacts[0].kind. */
  kind?: string;
  /** context_delta.summary placeholder. Default: bash placeholder string. */
  summary?: string;
  /** context_delta.tokens_used. Default: 0. */
  tokensUsed?: number;
  /** context_delta.token_budget. Default: contract.context_delta.token_budget_max ?? 4000. */
  tokenBudget?: number;
  /** Sender self-assessed confidence [0, 1]. Default: 0.5. */
  confidence?: number;
  /** constraints.trust_level. Default: contract.trust_level ?? "standard". */
  trustLevel?: TrustLevel;
  /** trace.host. Default: process.env.ECL_HOST ?? "raw". */
  host?: string;
  /** trace.model. Default: process.env.ECL_MODEL ?? "unknown". */
  model?: string;
  /** trace.tier. Default: "standard". */
  tier?: Tier;
  /** integrity.method. Default: "sha256". */
  integrityMethod?: IntegrityMethod;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip milliseconds to match bash `date -u +"%Y-%m-%dT%H:%M:%SZ"`. */
function rfc3339Now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Compute SHA-256 of raw bytes; returns lowercase hex. */
function sha256hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Compute HMAC-SHA-256 of raw bytes; returns lowercase hex. */
function hmacSha256hex(buf: Buffer, key: string): string {
  return crypto.createHmac("sha256", key).update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// envelopeBuild
// ---------------------------------------------------------------------------

/**
 * Build a v1.0 ECL envelope from an artifact and a contract.
 *
 * Returns a typed Envelope object. All defaults mirror
 * `reference-sdk/bash/envelope-build.sh` exactly.
 *
 * @throws {EclError} code="USAGE" — missing required option, invalid
 *   performative, objective too long, hmac-sha256 without ECL_HMAC_KEY,
 *   or unsupported integrity method.
 * @throws {EclError} code="IO_FAILED" — artifact or contract file unreadable.
 * @throws {EclError} code="INTEGRITY_COMPUTE_FAILED" — hash computation error.
 */
export async function envelopeBuild(opts: EnvelopeBuildOptions): Promise<Envelope> {
  // --- Validate required fields ---
  if (!opts.artifact) {
    throw new EclError({ code: "USAGE", message: "Required: artifact" });
  }
  if (!opts.contract) {
    throw new EclError({ code: "USAGE", message: "Required: contract" });
  }
  if (!opts.performative) {
    throw new EclError({ code: "USAGE", message: "Required: performative" });
  }
  if (!opts.objective) {
    throw new EclError({ code: "USAGE", message: "Required: objective" });
  }

  // --- Validate performative enum ---
  if (!VALID_PERFORMATIVES.has(opts.performative)) {
    throw new EclError({
      code: "USAGE",
      message: `Invalid performative: ${opts.performative}. Must be one of ${[...VALID_PERFORMATIVES].join(", ")}`,
    });
  }

  // --- Validate objective length ---
  if (opts.objective.length > 240) {
    throw new EclError({
      code: "USAGE",
      message: `objective exceeds 240 chars (got ${opts.objective.length})`,
    });
  }

  // --- Read artifact as raw bytes ---
  let artifactBuf: Buffer;
  try {
    artifactBuf = fs.readFileSync(opts.artifact);
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot read artifact: ${opts.artifact}`,
      cause: err,
    });
  }

  // --- Read and parse contract YAML ---
  let contractRaw: RawContract;
  try {
    const contractText = fs.readFileSync(opts.contract, "utf8");
    contractRaw = parseYaml(contractText) as RawContract;
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot read or parse contract: ${opts.contract}`,
      cause: err,
    });
  }

  // --- Resolve contract-derived defaults (mirrors bash :125-136) ---
  const fromEidolon = contractRaw.from ?? "";
  const toEidolon = contractRaw.to ?? "";
  const edgeOrigin = contractRaw.edge_origin ?? "implicit";

  const kind =
    opts.kind !== undefined ? opts.kind : (contractRaw.artifacts?.[0]?.kind ?? "");

  const tokenBudget =
    opts.tokenBudget !== undefined
      ? opts.tokenBudget
      : (contractRaw.context_delta?.token_budget_max ?? 4000);

  const trustLevel: TrustLevel =
    opts.trustLevel !== undefined
      ? opts.trustLevel
      : ((contractRaw.trust_level as TrustLevel | undefined) ?? "standard");

  // --- Defaults ---
  const integrityMethod: IntegrityMethod = opts.integrityMethod ?? "sha256";
  const messageId = opts.messageId ?? uuidv7();
  const threadId = opts.threadId ?? messageId;
  const parentId: string | null =
    opts.parentId === undefined || opts.parentId === null ? null : opts.parentId;
  const fromVersion = opts.fromVersion ?? "0.0.0";
  const toVersion = opts.toVersion ?? "0.0.0";
  const summary =
    opts.summary ?? "(generated by envelopeBuild; populate before sending)";
  const tokensUsed = opts.tokensUsed ?? 0;
  const confidence = opts.confidence ?? 0.5;
  const host = opts.host ?? process.env["ECL_HOST"] ?? "raw";
  const model = opts.model ?? process.env["ECL_MODEL"] ?? "unknown";
  const tier: Tier = opts.tier ?? "standard";

  // --- Compute integrity ---
  let integrityValue: string;
  try {
    if (integrityMethod === "sha256") {
      integrityValue = sha256hex(artifactBuf);
    } else if (integrityMethod === "hmac-sha256") {
      const hmacKey = process.env["ECL_HMAC_KEY"];
      if (!hmacKey) {
        throw new EclError({
          code: "USAGE",
          message: "ECL_HMAC_KEY required for integrity-method=hmac-sha256",
        });
      }
      integrityValue = hmacSha256hex(artifactBuf, hmacKey);
    } else {
      throw new EclError({
        code: "USAGE",
        message: `Unsupported integrity-method: ${String(integrityMethod)}`,
      });
    }
  } catch (err) {
    if (err instanceof EclError) throw err;
    throw new EclError({
      code: "INTEGRITY_COMPUTE_FAILED",
      message: "Integrity computation failed",
      cause: err,
    });
  }

  // --- Size ---
  const sizeBytes = artifactBuf.byteLength;

  // --- Timestamp (seconds precision, matching bash `date -u +"%Y-%m-%dT%H:%M:%SZ"`) ---
  const ts = rfc3339Now();

  // --- Construct envelope in canonical key order matching bash jq -n output ---
  // Key order: envelope_version, message_id, thread_id, parent_id, from, to,
  //            performative, edge_origin, objective, artifact, context_delta,
  //            constraints, confidence, integrity, trace
  // (envelope-build.sh:218-245)
  const envelope: Envelope = {
    envelope_version: "1.0",
    message_id: messageId,
    thread_id: threadId,
    parent_id: parentId,
    from: { eidolon: fromEidolon, version: fromVersion },
    to: { eidolon: toEidolon, version: toVersion },
    performative: opts.performative,
    edge_origin: edgeOrigin as "roster" | "composition" | "implicit",
    objective: opts.objective,
    artifact: {
      kind,
      schema_version: "1.0",
      path: path.basename(opts.artifact),
      sha256: integrityValue,
      size_bytes: sizeBytes,
    },
    // context_delta schema uses `token_budget` but types.ts (S1) named it
    // `token_budget_max`. Cast preserves schema-correct key pending S3 fix.
    context_delta: {
      token_budget: tokenBudget,
      tokens_used: tokensUsed,
      input_handles: [],
      summary,
    } as unknown as ContextDelta,
    constraints: { trust_level: trustLevel },
    confidence,
    integrity: { method: integrityMethod, value: integrityValue },
    trace: { ts, host, model, tier },
  };

  return envelope;
}
