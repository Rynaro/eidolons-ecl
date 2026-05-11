/**
 * The ECL spec version this SDK targets.
 *
 * SDK MAJOR.MINOR tracks the spec MAJOR.MINOR (lock-step per
 * `docs/tech-choice.md:42-45`). SDK PATCH may differ from spec PATCH
 * (e.g. SDK 1.1.1 targets spec 1.1 — patch bumps land independently).
 *
 * v1.1 promoted HMAC-SHA-256 to RECOMMENDED at `trust_level=high` and
 * added the I-5 SHOULD-level conformance gate. See spec/ecl-1.1.md §6.4.
 */
export const ECL_VERSION_TARGET = "1.1" as const;
