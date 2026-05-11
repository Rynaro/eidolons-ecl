/**
 * Scaffold smoke tests.
 *
 * Gates:
 *   G-S1-Test: this file must pass for `make test` to exit 0.
 *
 * Verifies:
 *   1. ECL_VERSION_TARGET equals "1.0".
 *   2. envelopeBuild (S2) is exported as a function — throws USAGE for missing args.
 *   3. traceTail (S5) is exported and returns an AsyncIterable.
 *   4. envelopeVerify (S3) is exported as a function — throws USAGE for missing envelope.
 *   5. handoffEmit (S4) is exported as a function — throws USAGE for missing artifact.
 */
import { describe, expect, it } from "vitest";
import {
  ECL_VERSION_TARGET,
  EclError,
  envelopeBuild,
  envelopeVerify,
  handoffEmit,
  traceTail,
} from "../index.js";

describe("ECL_VERSION_TARGET", () => {
  it('equals "1.0"', () => {
    expect(ECL_VERSION_TARGET).toBe("1.0");
  });
});

describe("handoffEmit (S4 — implemented)", () => {
  it("is exported as a function", () => {
    expect(typeof handoffEmit).toBe("function");
  });

  it("throws EclError with code USAGE (not NOT_IMPLEMENTED) for missing artifact", async () => {
    let caught: unknown;
    try {
      // @ts-expect-error — intentional: passing empty object to test implemented behavior
      await handoffEmit({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EclError);
    const eclErr = caught as EclError;
    expect(eclErr.code).toBe("USAGE");
    expect(eclErr.code).not.toBe("NOT_IMPLEMENTED");
  });
});

describe("envelopeVerify (S3 — implemented)", () => {
  it("is exported as a function", () => {
    expect(typeof envelopeVerify).toBe("function");
  });

  it("throws EclError with code USAGE (not NOT_IMPLEMENTED) for missing envelope", async () => {
    let caught: unknown;
    try {
      // @ts-expect-error — intentional: passing empty object to test implemented behavior
      await envelopeVerify({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EclError);
    const eclErr = caught as EclError;
    expect(eclErr.code).toBe("USAGE");
    expect(eclErr.code).not.toBe("NOT_IMPLEMENTED");
  });
});

describe("envelopeBuild (S2 — implemented)", () => {
  it("is exported as a function", () => {
    expect(typeof envelopeBuild).toBe("function");
  });

  it("throws EclError with code USAGE (not NOT_IMPLEMENTED) for empty options", async () => {
    let caught: unknown;
    try {
      // @ts-expect-error — intentional: passing empty object to test implemented behavior
      await envelopeBuild({});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EclError);
    const eclErr = caught as EclError;
    expect(eclErr.code).toBe("USAGE");
    expect(eclErr.code).not.toBe("NOT_IMPLEMENTED");
  });
});

describe("traceTail (S5 — implemented)", () => {
  it("is exported and returns an AsyncIterable", () => {
    // traceTail is an async generator; calling it returns an AsyncGenerator
    // (which implements AsyncIterable). It should not throw synchronously.
    const result = traceTail({});
    expect(result).toBeDefined();
    expect(typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator]).toBe("function");
  });
});
