/**
 * Hand-authored TypeScript types derived from ECL v2.0 JSON schemas.
 *
 * Shapes are derived from:
 *   - schemas/envelope.v2.json (adds ISE block)
 *   - schemas/envelope.v1.json (retained for v1.x compat)
 *   - schemas/per-eidolon/_base-profile.v1.json
 *   - schemas/handoff-event.v1.json
 *   - schemas/performative.v1.json (enum values)
 *
 * This file is intentionally kept in sync with the schemas manually for
 * ECL spec v2.0. Code generation is deferred to a future story; manual
 * derivation is cheap and reviewable at this spec version.
 */

// ---------------------------------------------------------------------------
// Performative — ECL §2
// ---------------------------------------------------------------------------

/**
 * The 10 valid ECL performatives (§2). String literal union matches the
 * performative.v1.json enum.
 */
export type Performative =
  | "REQUEST"
  | "INFORM"
  | "PROPOSE"
  | "CRITIQUE"
  | "DECIDE"
  | "DELEGATE"
  | "ACKNOWLEDGE"
  | "ESCALATE"
  | "RESUME"
  | "REFUSE";

// ---------------------------------------------------------------------------
// Agent reference — envelope.v1.json $defs/agentRef
// ---------------------------------------------------------------------------

/**
 * Reference to an Eidolon by slug and version. Used in envelope `from`/`to`.
 * Reserved slugs: "human", "orchestrator" (version = "n/a").
 */
export interface AgentRef {
  /** Lowercase slug (^[a-z][a-z0-9-]*$). */
  eidolon: string;
  /** SemVer string or the literal "n/a" for human/orchestrator. */
  version: string;
}

// ---------------------------------------------------------------------------
// Supporting enums / literals
// ---------------------------------------------------------------------------

/** Where the (from, to) edge is declared. ECL §3.3. */
export type EdgeOrigin = "roster" | "composition" | "implicit";

/** Envelope trust level. ECL §constraints.trust_level. */
export type TrustLevel = "low" | "standard" | "high";

/** Routing tier. ECL §5.2. */
export type Tier = "standard" | "trance";

/** Integrity method. ECL §6.1. */
export type IntegrityMethod = "sha256" | "hmac-sha256";

// ---------------------------------------------------------------------------
// ISE trust-hierarchy — envelope.v2.json $defs/ise (ECL v2.0 §6.5)
// ---------------------------------------------------------------------------

/** Emitter's claim about how the artefact was produced. ECL v2.0 §6.5.2. */
export type AssertionGrade = "unverified" | "self-attested" | "validated" | "human-reviewed";

/** `ise.provenance` — how the artefact was derived. */
export interface IseProvenance {
  /** Eidolon methodology + semver, e.g. "spectra-4.3.1". */
  methodology_version: string;
  /** Distinct tool primitives invoked (≤32 items). */
  tool_surface?: string[];
  /** Sibling-Eidolon consults (≤8 items). */
  lateral_consults?: Array<{ eidolon: string; performative: string }>;
}

/** `ise.receiver_authorization` — what the receiver may do. */
export interface IseReceiverAuthorization {
  /** Receiver MAY hand off to next contracted edge without operator confirm. Default true. */
  auto_route?: boolean;
  /** Receiver MAY merge into mainline without operator confirm. Default false. */
  auto_merge?: boolean;
  /** Receiver MAY deploy/publish without operator confirm. Default false. */
  auto_deploy?: boolean;
}

/**
 * ISE trust-hierarchy block. Optional at v2.0. When present, `assertion_grade`
 * is required. See ECL v2.0 §6.5.
 */
export interface IseBlock {
  assertion_grade: AssertionGrade;
  provenance?: IseProvenance;
  receiver_authorization?: IseReceiverAuthorization;
}

// ---------------------------------------------------------------------------
// Envelope sub-objects
// ---------------------------------------------------------------------------

/** `artifact` block — envelope.v1.json properties.artifact. */
export interface ArtifactBlock {
  /** Kind slug (^[a-z][a-z0-9-]*$). */
  kind: string;
  /** SemVer of the per-Eidolon profile schema. */
  schema_version: string;
  /** Relative path to the payload (no leading slash, no `..`). */
  path: string;
  /** Lowercase hex SHA-256 digest of the payload bytes. */
  sha256: string;
  /** Payload byte count at emit time. */
  size_bytes: number;
}

/** `context_delta` block — context-delta.v1.json. */
export interface ContextDelta {
  tokens_used: number;
  token_budget_max: number;
  /** Optional summary added to the thread. */
  summary?: string;
}

/** `constraints` block — envelope.v1.json properties.constraints. */
export interface ConstraintsBlock {
  /** RFC 3339 deadline, or null for no deadline. */
  deadline_ts?: string | null;
  trust_level?: TrustLevel;
}

/** `expected_response` block. */
export interface ExpectedResponseBlock {
  performative?: Performative;
  shape_hint?: string;
}

/** `integrity` block — ECL §6. */
export interface IntegrityBlock {
  method: IntegrityMethod;
  /** Lowercase hex SHA-256 (or HMAC-SHA-256) digest. */
  value: string;
}

/** `trace` block — envelope.v1.json properties.trace. */
export interface TraceBlock {
  /** RFC 3339 UTC timestamp at envelope construction. */
  ts: string;
  /** Host environment slug (e.g. "claude-code", "cursor", "raw"). */
  host: string;
  /** Model identifier (e.g. "claude-sonnet-4-6"). */
  model: string;
  tier: Tier;
}

// ---------------------------------------------------------------------------
// Envelope — envelope.v1.json (top-level)
// ---------------------------------------------------------------------------

/**
 * Full ECL envelope v2. Required fields match `required` in the schema.
 * Optional fields are typed accordingly.
 *
 * v1.x envelopes (without `ise`) remain valid under v2.0 (§7.3 compat window).
 *
 * Vendor extension fields (x_*) are permitted by the schema
 * (patternProperties) but are not typed here; consumers can use an
 * intersection type if needed.
 */
export interface Envelope {
  /** ECL spec version (^(1\.[012]|2\.0)(\.\d+)?$). */
  envelope_version: string;
  /** Globally unique message ID. UUIDv7 RECOMMENDED. */
  message_id: string;
  /** UUID grouping all envelopes of one logical mission. */
  thread_id: string;
  /** Causal predecessor message_id, or null on first envelope. */
  parent_id: string | null;
  from: AgentRef;
  to: AgentRef;
  performative: Performative;
  /** Where the (from, to) edge is declared. */
  edge_origin?: EdgeOrigin;
  /** Goal of this message (1–240 chars). */
  objective: string;
  artifact: ArtifactBlock;
  context_delta?: ContextDelta;
  constraints?: ConstraintsBlock;
  /** ISE trust-hierarchy block. Optional at v2.0. ECL v2.0 §6.5. */
  ise?: IseBlock;
  expected_response?: ExpectedResponseBlock;
  /** Sender self-assessed confidence [0, 1]. */
  confidence?: number;
  /** Material assumptions the receiver should know. */
  assumptions?: string[];
  integrity: IntegrityBlock;
  trace: TraceBlock;
}

// ---------------------------------------------------------------------------
// Contract — handoff-contract.v1.json (minimal; S1 only needs the shape)
// ---------------------------------------------------------------------------

/**
 * Handoff contract loaded from `contracts/<from>-to-<to>.yaml`. Only the
 * fields consumed by the SDK are typed here; the full schema lives at
 * schemas/handoff-contract.v1.json. Unused fields (schema_ref,
 * required_sections, evidence_anchor_required) are tracked in GAP-2 for
 * a future story.
 */
export interface Contract {
  /** Contract schema version. */
  contract_version: string;
  /** Slug of the emitting Eidolon. */
  from: string;
  /** Slug of the receiving Eidolon. */
  to: string;
  /** Trust level required for this edge. */
  trust_level?: TrustLevel;
  /** Allowed performatives on this edge. */
  allowed_performatives: Performative[];
  /** Artifacts permitted on this edge. */
  artifacts: Array<{
    kind: string;
    schema_version: string;
  }>;
  context_delta?: {
    token_budget_max: number;
  };
}

// ---------------------------------------------------------------------------
// Trace event — handoff-event.v1.json
// ---------------------------------------------------------------------------

/** Base fields shared by all trace event kinds. */
interface TraceEventBase {
  /** RFC 3339 UTC timestamp. */
  ts: string;
  /** Globally unique message ID this event refers to. */
  message_id: string;
  /** Thread the message belongs to. */
  thread_id: string;
  /** "<eidolon>@<version>" slug. */
  from: string;
  /** "<eidolon>@<version>" slug. */
  to: string;
  performative: Performative;
  integrity_method: IntegrityMethod;
  context_tokens?: number;
  model?: string;
  tier?: Tier;
}

/** Envelope was emitted by the sender. */
export interface EmitTraceEvent extends TraceEventBase {
  event: "emit";
}

/** Envelope was received by the target. */
export interface ReceiveTraceEvent extends TraceEventBase {
  event: "receive";
}

/** Envelope passed verification. */
export interface VerifyPassTraceEvent extends TraceEventBase {
  event: "verify_pass";
}

/** Envelope failed verification. ECL §5.3 requires `verify_failure_code`. */
export interface VerifyFailTraceEvent extends TraceEventBase {
  event: "verify_fail";
  verify_failure_code:
    | "INTEGRITY_MISMATCH"
    | "SCHEMA_INVALID"
    | "UNDECLARED_EDGE"
    | "PERFORMATIVE_NOT_ALLOWED"
    | "ARTIFACT_KIND_NOT_ALLOWED"
    | "CONTEXT_OVER_BUDGET"
    | "MISSING_REQUIRED_SECTION";
}

/**
 * Discriminated union of all trace event kinds. Switch on `event` to
 * narrow to the specific type.
 */
export type TraceEvent =
  | EmitTraceEvent
  | ReceiveTraceEvent
  | VerifyPassTraceEvent
  | VerifyFailTraceEvent;

// ---------------------------------------------------------------------------
// Per-Eidolon base profile — schemas/per-eidolon/_base-profile.v1.json
// ---------------------------------------------------------------------------

/**
 * Common YAML frontmatter required of any ECL artefact. ECL §3.1.
 * Kind-specific profiles extend this with their own required keys.
 */
export interface BaseProfile {
  /** Eidolon slug that emitted this artefact. */
  eidolon: string;
  /** SemVer of the emitting Eidolon. */
  version: string;
  /** Artefact kind slug. MUST equal envelope's artifact.kind. */
  kind: string;
  /** Methodology-defined status. */
  status: string;
  /** RFC 3339 UTC timestamp. */
  created_at: string;
  /** RECOMMENDED: mirror the envelope's thread_id. */
  thread_id?: string;
  /** Number of path:line citations in the body. */
  evidence_anchors_count?: number;
  /** Additional kind-specific fields are permitted. */
  [key: string]: unknown;
}
