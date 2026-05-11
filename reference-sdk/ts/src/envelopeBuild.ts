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
import { v7 as uuidv7 } from "uuid";
import { parse as parseYaml } from "yaml";
import { EclError } from "./errors.js";
import type {
  ContextDelta,
  Envelope,
  IntegrityMethod,
  Performative,
  Tier,
  TrustLevel,
} from "./types.js";

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

interface RawContract {
  from?: string;
  to?: string;
  edge_origin?: string;
  trust_level?: string;
  artifacts?: Array<{ kind?: string; schema_version?: string }>;
  context_delta?: { token_budget_max?: number };
}

export interface EnvelopeBuildOptions {
  artifact: string;
  contract: string;
  performative: Performative;
  objective: string;
  messageId?: string;
  threadId?: string;
  parentId?: string | null;
  fromVersion?: string;
  toVersion?: string;
  kind?: string;
  summary?: string;
  tokensUsed?: number;
  tokenBudget?: number;
  confidence?: number;
  trustLevel?: TrustLevel;
  host?: string;
  model?: string;
  tier?: Tier;
  integrityMethod?: IntegrityMethod;
}

function rfc3339Now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sha256hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hmacSha256hex(buf: Buffer, key: string): string {
  return crypto.createHmac("sha256", key).update(buf).digest("hex");
}

export async function envelopeBuild(opts: EnvelopeBuildOptions): Promise<Envelope> {
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
  if (!VALID_PERFORMATIVES.has(opts.performative)) {
    throw new EclError({
      code: "USAGE",
      message: `Invalid performative: ${opts.performative}. Must be one of ${[...VALID_PERFORMATIVES].join(", ")}`,
    });
  }
  if (opts.objective.length > 240) {
    throw new EclError({
      code: "USAGE",
      message: `objective exceeds 240 chars (got ${opts.objective.length})`,
    });
  }

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

  const fromEidolon = contractRaw.from ?? "";
  const toEidolon = contractRaw.to ?? "";
  const edgeOrigin = contractRaw.edge_origin ?? "implicit";
  const kind = opts.kind !== undefined ? opts.kind : (contractRaw.artifacts?.[0]?.kind ?? "");
  const tokenBudget =
    opts.tokenBudget !== undefined
      ? opts.tokenBudget
      : (contractRaw.context_delta?.token_budget_max ?? 4000);
  const trustLevel: TrustLevel =
    opts.trustLevel !== undefined
      ? opts.trustLevel
      : ((contractRaw.trust_level as TrustLevel | undefined) ?? "standard");

  const integrityMethod: IntegrityMethod = opts.integrityMethod ?? "sha256";
  const messageId = opts.messageId ?? uuidv7();
  const threadId = opts.threadId ?? messageId;
  const parentId: string | null =
    opts.parentId === undefined || opts.parentId === null ? null : opts.parentId;
  const fromVersion = opts.fromVersion ?? "0.0.0";
  const toVersion = opts.toVersion ?? "0.0.0";
  const summary = opts.summary ?? "(generated by envelopeBuild; populate before sending)";
  const tokensUsed = opts.tokensUsed ?? 0;
  const confidence = opts.confidence ?? 0.5;
  const host = opts.host ?? process.env.ECL_HOST ?? "raw";
  const model = opts.model ?? process.env.ECL_MODEL ?? "unknown";
  const tier: Tier = opts.tier ?? "standard";

  let integrityValue: string;
  try {
    if (integrityMethod === "sha256") {
      integrityValue = sha256hex(artifactBuf);
    } else if (integrityMethod === "hmac-sha256") {
      const hmacKey = process.env.ECL_HMAC_KEY;
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

  const sizeBytes = artifactBuf.byteLength;
  const ts = rfc3339Now();

  // Key order matches bash jq -n builder (envelope-build.sh:218-245).
  // context_delta schema uses `token_budget`; types.ts (S1) has `token_budget_max`.
  // Cast pending S3 reconciliation.
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
