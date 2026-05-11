/**
 * S1 scaffold smoke tests.
 *
 * Gates:
 *   G-S1-Test: this file must pass for `make test` to exit 0.
 *
 * Verifies:
 *   1. ECL_VERSION_TARGET equals "1.0".
 *   2. The four function stubs are exported and throw EclError with
 *      code "NOT_IMPLEMENTED" (confirming they are stubs, not silently
 *      no-ops or missing exports).
 */
import { describe, it, expect } from "vitest";
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

describe("function stubs", () => {
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

  assertNotImplemented(() => envelopeBuild({}), "envelopeBuild");
  assertNotImplemented(() => envelopeVerify({}), "envelopeVerify");
  assertNotImplemented(() => handoffEmit({}), "handoffEmit");
  assertNotImplemented(() => traceTail({}), "traceTail");
});
