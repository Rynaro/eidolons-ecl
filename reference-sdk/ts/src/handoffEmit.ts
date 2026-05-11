/**
 * handoffEmit — TypeScript port of reference-sdk/bash/handoff-emit.sh.
 *
 * Atomic emit: builds the envelope (via envelopeBuild), writes the sidecar
 * next to the artifact, and appends one `emit` event to the trace JSONL.
 * Mirrors the bash three-step flow at handoff-emit.sh:60-97.
 *
 * Sidecar serialization: `JSON.stringify(envelope, null, 2) + "\n"` — matches
 * the bash `printf '%s\n' "$ENVELOPE_JSON" > "$ENVELOPE_PATH"` shape (jq -n's
 * pretty-print default plus trailing newline). Bash overwrites the file
 * unconditionally; this port matches.
 *
 * Trace event: shape per schemas/handoff-event.v1.json. Required fields are
 * ts, event, message_id, thread_id, from, to, performative, integrity_method.
 * Optional fields (context_tokens, model, tier) are populated from the
 * envelope when present. Written via fs.appendFileSync with `flag: "a"`
 * (POSIX append, single write) — matches Decision D-3.
 *
 * @see reference-sdk/bash/handoff-emit.sh — bash reference
 * @see schemas/handoff-event.v1.json — trace event schema
 * @see .spectra/ts-sdk-port.md §S4 — Story S4 spec
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type EnvelopeBuildOptions, envelopeBuild } from "./envelopeBuild.js";
import { EclError } from "./errors.js";
import type { Envelope, Performative } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HandoffEmitOptions extends EnvelopeBuildOptions {
  /**
   * Trace directory. The trace JSONL is appended to
   * `<traceDir>/<envelope.thread_id>.jsonl`.
   * @default ".eidolons/.trace"
   */
  traceDir?: string;
}

export interface EmitResult {
  /** Absolute path to the written `<artifact>.envelope.json` sidecar. */
  envelopePath: string;
  /** Absolute path to the trace JSONL the emit event was appended to. */
  tracePath: string;
  /** The envelope object that was built and written. */
  envelope: Envelope;
}

interface EmitEventLine {
  ts: string;
  event: "emit";
  message_id: string;
  thread_id: string;
  from: string;
  to: string;
  performative: Performative;
  integrity_method: "sha256" | "hmac-sha256";
  context_tokens?: number;
  model?: string;
  tier?: "standard" | "trance";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** RFC 3339 UTC timestamp at seconds precision (matches bash `date -u`). */
function rfc3339Now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Build the trace event line per schemas/handoff-event.v1.json. */
function buildEmitEvent(envelope: Envelope): EmitEventLine {
  const line: EmitEventLine = {
    ts: rfc3339Now(),
    event: "emit",
    message_id: envelope.message_id,
    thread_id: envelope.thread_id,
    from: `${envelope.from.eidolon}@${envelope.from.version}`,
    to: `${envelope.to.eidolon}@${envelope.to.version}`,
    performative: envelope.performative,
    integrity_method: envelope.integrity.method,
  };

  // Optional fields — populated when the envelope carries them.
  if (envelope.context_delta?.tokens_used !== undefined) {
    line.context_tokens = envelope.context_delta.tokens_used;
  }
  if (envelope.trace?.model) {
    line.model = envelope.trace.model;
  }
  if (envelope.trace?.tier) {
    line.tier = envelope.trace.tier;
  }

  return line;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build, write, and emit a v1.0 ECL envelope in one atomic call.
 *
 * Steps:
 *   1. Call `envelopeBuild(opts)` to construct the envelope (all input
 *      validation happens here — invalid performative, missing required
 *      field, oversized objective all throw before the disk write).
 *   2. Write `<artifact>.envelope.json` next to the artifact, overwriting
 *      any prior sidecar.
 *   3. Ensure `traceDir` exists (recursive mkdir), then append one `emit`
 *      event to `<traceDir>/<thread_id>.jsonl`.
 *
 * Returns the absolute paths of both writes plus the envelope object.
 *
 * @example
 * ```ts
 * const result = await handoffEmit({
 *   artifact: ".eidolons/atlas/output/scout-report.md",
 *   contract: "contracts/atlas-to-spectra.yaml",
 *   performative: "PROPOSE",
 *   objective: "Hand off scout-report for planning.",
 * });
 * // result.envelopePath = ".eidolons/atlas/output/scout-report.md.envelope.json"
 * // result.tracePath    = ".eidolons/.trace/<thread_id>.jsonl"
 * ```
 */
export async function handoffEmit(opts: HandoffEmitOptions): Promise<EmitResult> {
  if (!opts.artifact) {
    throw new EclError({ code: "USAGE", message: "Required: artifact" });
  }

  const traceDir = opts.traceDir ?? ".eidolons/.trace";

  // Step 1 — build envelope (envelopeBuild handles all input validation).
  const envelope = await envelopeBuild(opts);

  // Step 2 — write sidecar at <artifact>.envelope.json (overwrite).
  const envelopePath = `${opts.artifact}.envelope.json`;
  try {
    fs.writeFileSync(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot write envelope sidecar: ${envelopePath}`,
      cause: err,
    });
  }

  // Step 3a — ensure trace dir exists.
  try {
    fs.mkdirSync(traceDir, { recursive: true });
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot create trace dir: ${traceDir}`,
      cause: err,
    });
  }

  // Step 3b — append the emit event line.
  const tracePath = path.join(traceDir, `${envelope.thread_id}.jsonl`);
  const event = buildEmitEvent(envelope);
  try {
    fs.appendFileSync(tracePath, `${JSON.stringify(event)}\n`, { flag: "a" });
  } catch (err) {
    throw new EclError({
      code: "IO_FAILED",
      message: `Cannot append trace event: ${tracePath}`,
      cause: err,
    });
  }

  return { envelopePath, tracePath, envelope };
}
