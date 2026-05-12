"""Single source of truth for SDK + spec target versions.

SDK MAJOR.MINOR tracks the spec MAJOR.MINOR (lock-step per
``docs/tech-choice.md:42-45``). SDK PATCH may differ from spec PATCH
(e.g. SDK 1.2.0 targets spec 1.2 — patch bumps land independently).
"""

__version__ = "1.2.0"
ECL_VERSION_TARGET: str = "1.2"
