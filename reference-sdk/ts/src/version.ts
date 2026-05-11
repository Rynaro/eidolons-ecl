/**
 * The ECL spec version this SDK targets.
 *
 * The SDK version (package.json) and the spec version tracked here are
 * intentionally decoupled: SDK v1.1.x targets ECL spec v1.0. They will
 * move in lock-step only when the spec publishes a breaking change.
 *
 * See docs/tech-choice.md:129 for the rationale.
 */
export const ECL_VERSION_TARGET = "1.0" as const;
