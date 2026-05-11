"""ECL SDK error type — mirrors reference-sdk/ts/src/errors.ts.

``EclError`` is the single error type raised by all SDK functions. The
discriminant ``code`` maps to ECL §5.3 failure codes (schema-level) plus
SDK-internal codes for programming errors and I/O failures.

Bash SDK exit-code equivalents are documented at each code; a future CLI
wrapper will translate these codes to exit codes.
"""

from __future__ import annotations

from typing import Literal, Optional

# ECL §5.3 conformance failure codes (schema-level).
EclErrorCode = Literal[
    "SCHEMA_MISMATCH",
    "INTEGRITY_FAIL",
    "PERFORMATIVE_NOT_ALLOWED",
    "EDGE_UNKNOWN",
    "ARTIFACT_KIND_NOT_ALLOWED",
    "BUDGET_EXCEEDED",
    "MISSING_SECTION",
    "ANCHOR_REQUIRED",
    # SDK-internal codes (not in ECL §5.3).
    "USAGE",
    "INTEGRITY_COMPUTE_FAILED",
    "IO_FAILED",
    "NOT_IMPLEMENTED",
]

# Which validation phase produced the failure.
Phase = Literal["py-jsonschema", "bash-checker"]


class EclError(Exception):
    """Structured error raised by all ECL SDK functions.

    Consumers can branch on ``error.code`` to handle specific failure
    modes without string-matching the message.
    """

    def __init__(
        self,
        code: EclErrorCode,
        message: str,
        *,
        gate: Optional[str] = None,
        phase: Optional[Phase] = None,
        cause: Optional[BaseException] = None,
    ) -> None:
        super().__init__(message)
        self.code: EclErrorCode = code
        #: ECL gate that triggered the failure (e.g. "E-1.1", "I-2").
        self.gate: Optional[str] = gate
        #: Which validation phase produced the failure.
        self.phase: Optional[Phase] = phase
        if cause is not None:
            self.__cause__ = cause
