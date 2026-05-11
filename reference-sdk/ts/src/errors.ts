/**
 * ECL SDK error model.
 *
 * EclError is the single error type thrown by all SDK functions. The
 * discriminant `code` maps to ECL §5.3 failure codes (schema-level) plus
 * SDK-internal codes for programming errors and I/O failures.
 *
 * Bash SDK exit-code equivalents are documented at each code; a future CLI
 * wrapper will translate these codes to exit codes.
 */

/** ECL §5.3 conformance failure codes (schema-level). */
export type VerifyFailureCode =
  | "SCHEMA_MISMATCH"
  | "INTEGRITY_FAIL"
  | "PERFORMATIVE_NOT_ALLOWED"
  | "EDGE_UNKNOWN"
  | "ARTIFACT_KIND_NOT_ALLOWED"
  | "BUDGET_EXCEEDED"
  | "MISSING_SECTION"
  | "ANCHOR_REQUIRED";

/** SDK-internal codes (not in ECL §5.3). */
export type SdkInternalCode =
  | "USAGE"
  | "INTEGRITY_COMPUTE_FAILED"
  | "IO_FAILED"
  | "NOT_IMPLEMENTED";

/** Union of all codes that EclError can carry. */
export type EclErrorCode = VerifyFailureCode | SdkInternalCode;

export interface EclErrorOptions {
  code: EclErrorCode;
  message: string;
  /** ECL gate that triggered the failure (e.g. "E-1.1", "I-2"). */
  gate?: string;
  /** Which validation phase produced the failure. */
  phase?: "ts-ajv" | "bash-checker";
  /** Original cause if wrapping another error. */
  cause?: unknown;
}

/**
 * Structured error thrown by all ECL SDK functions.
 *
 * Consumers can switch on `error.code` to handle specific failure modes
 * without string-matching the message.
 */
export class EclError extends Error {
  readonly code: EclErrorCode;
  readonly gate: string | undefined;
  readonly phase: "ts-ajv" | "bash-checker" | undefined;

  constructor(opts: EclErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "EclError";
    this.code = opts.code;
    this.gate = opts.gate;
    this.phase = opts.phase;

    // Maintain proper prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
