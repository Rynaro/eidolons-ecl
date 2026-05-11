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

import { EclError } from "./errors.js";

// ---------------------------------------------------------------------------
// S2 — envelopeBuild (Wave II, landed)
// ---------------------------------------------------------------------------
export { envelopeBuild } from "./envelopeBuild.js";
export type { EnvelopeBuildOptions } from "./envelopeBuild.js";

// ---------------------------------------------------------------------------
// S5 — traceTail (Story S5, Wave II)
// ---------------------------------------------------------------------------
export { traceTail, type TraceTailOptions } from "./traceTail.js";

// ---------------------------------------------------------------------------
// Function stubs — Stories S3, S4 (Wave III, not yet landed)
//
// Each function throws EclError({ code: "NOT_IMPLEMENTED" }) so that:
//   1. The TypeScript build succeeds (no dangling `export` declarations).
//   2. Tests written against unimplemented stories fail loudly and early.
//   3. The four symbols are present and importable (scaffold.test.ts verifies
//      this).
//
// Implementations land in:
//   S3 — envelopeVerify  (Wave III, parallel with S4)
//   S4 — handoffEmit     (Wave III, parallel with S4)
// ---------------------------------------------------------------------------

/** @stub — implementation lands in Story S3. */
export function envelopeVerify(_opts: Record<string, unknown>): Promise<never> {
  throw new EclError({ code: "NOT_IMPLEMENTED", message: "Story S3 not landed" });
}

/** @stub — implementation lands in Story S4. */
export function handoffEmit(_opts: Record<string, unknown>): Promise<never> {
  throw new EclError({ code: "NOT_IMPLEMENTED", message: "Story S4 not landed" });
}
