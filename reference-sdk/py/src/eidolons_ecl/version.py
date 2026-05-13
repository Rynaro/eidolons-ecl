"""Single source of truth for SDK + spec target versions.

SDK MAJOR.MINOR tracks the spec MAJOR.MINOR (lock-step per
``docs/tech-choice.md:42-45``). SDK PATCH may differ from spec PATCH
(e.g. SDK 2.0.0 targets spec 2.0 — patch bumps land independently).

v2.0 introduces the ISE trust-hierarchy block (ECL §6.5) and widens the
envelope_version regex to accept v1.x envelopes (§7.3 compat window).
"""

__version__ = "2.0.0"
ECL_VERSION_TARGET: str = "2.0"
