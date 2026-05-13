/**
 * The ECL spec version this SDK targets.
 *
 * SDK MAJOR.MINOR tracks the spec MAJOR.MINOR (lock-step per
 * `docs/tech-choice.md:42-45`). SDK PATCH may differ from spec PATCH
 * (e.g. SDK 2.0.0 targets spec 2.0 — patch bumps land independently).
 *
 * v2.0 introduces the ISE trust-hierarchy block (§6.5), widens the
 * envelope_version regex to accept v1.x (§7.3 compat), and adds S-1/S-2/S-3
 * conformance gates. TS SDK jumped directly from "1.1" to "2.0" (skipping
 * "1.2" catch-up — see DECISION-S7 / DECISION-S10).
 */
export const ECL_VERSION_TARGET = "2.0" as const;
