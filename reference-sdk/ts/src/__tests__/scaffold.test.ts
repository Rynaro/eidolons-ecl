/**
 * S1 scaffold smoke tests.
 *
 * Gates:
 *   G-S1-Test: this file must pass for `make test` to exit 0.
 *
 * Verifies:
 *   1. ECL_VERSION_TARGET equals "1.0".
 *   2. The unimplemented function stubs (S3–S4) throw EclError with
 *      code "NOT_IMPLEMENTED".
 *   3. envelopeBuild (S2, now implemented) is exported as a function —
 *      it no longer throws NOT_IMPLEMENTED (it throws USAGE for missing args).
 *   4. traceTail (S5, now implemented) is exported and returns an
 *      AsyncIterable — it no longer throws NOT_IMPLEMENTED.
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

describe("function stubs (S3–S4 not yet landed)", () => {
  function assertNotImplemented(fn: () => unknown, name: string): void {
    it(`${name} throws EclError with code NOT_IMPLEMENTED`, () => {
      let caught: unknown;
      try {
        fn();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(EclError);
      const eclErr = caught as EclError;
      expect(eclErr.code).toBe("NOT_IMPLEMENTED");
    });
  }

  assertNotImplemented(() => envelopeVerify({}), "envelopeVerify");
  assertNotImplemented(() => handoffEmit({}), "handoffEmit");
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
