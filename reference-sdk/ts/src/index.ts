/**
 * @eidolons/ecl-sdk — ECL TypeScript reference SDK
 *
 * API parity with the bash reference SDK at reference-sdk/bash/. The bash
 * SDK remains the canonical reference; this is a port.
 *
 * Story S1 lands stubs for the four public functions. Full implementations
 * arrive in Stories S2–S5 (APIVR-Δ Wave II and III).
 *
 * @see ECL spec v1.0 — schemas/envelope.v1.json
 * @see docs/tech-choice.md — Option F (container-first, tsup, biome)
 */

export { ECL_VERSION_TARGET } from "./version.js";
export { EclError } from "./errors.js";
export type {
  EclErrorCode,
  VerifyFailureCode,
  SdkInternalCode,
  EclErrorOptions,
} from "./errors.js";
export type {
  Performative,
  AgentRef,
  EdgeOrigin,
  TrustLevel,
  Tier,
  IntegrityMethod,
  ArtifactBlock,
  ContextDelta,
  ConstraintsBlock,
  ExpectedResponseBlock,
  IntegrityBlock,
  TraceBlock,
  Envelope,
  Contract,
  TraceEvent,
  EmitTraceEvent,
  ReceiveTraceEvent,
  VerifyPassTraceEvent,
  VerifyFailTraceEvent,
  BaseProfile,
} from "./types.js";

// ---------------------------------------------------------------------------
// S2 — envelopeBuild (Wave II, landed)
// ---------------------------------------------------------------------------
export { envelopeBuild } from "./envelopeBuild.js";
export type { EnvelopeBuildOptions } from "./envelopeBuild.js";

// ---------------------------------------------------------------------------
// S5 — traceTail (Wave II, landed)
// ---------------------------------------------------------------------------
export { traceTail, type TraceTailOptions } from "./traceTail.js";

// ---------------------------------------------------------------------------
// S3 — envelopeVerify (Wave III, landed)
// ---------------------------------------------------------------------------
export {
  envelopeVerify,
  type EnvelopeVerifyOptions,
  type VerifyResult,
  type GateFailure,
  type GateWarning,
} from "./envelopeVerify.js";

// ---------------------------------------------------------------------------
// S4 — handoffEmit (Wave III, landed)
// ---------------------------------------------------------------------------
export { handoffEmit, type HandoffEmitOptions, type EmitResult } from "./handoffEmit.js";
