"""Scaffold smoke tests — Story S2.A.0.

These tests run inside the dev container via ``make test`` and exercise only
the stable surface committed in this story: version constants, EclError shape,
and CLI sub-command registration.
"""

from __future__ import annotations

import re
import subprocess
import sys

import pytest

from eidolons_ecl import ECL_VERSION_TARGET, EclError
from eidolons_ecl.__main__ import (
    main,
)
from eidolons_ecl.version import __version__

# ---------------------------------------------------------------------------
# Version constants
# ---------------------------------------------------------------------------


def test_ecl_version_target_equals_2_0() -> None:
    assert ECL_VERSION_TARGET == "2.0"


def test_version_is_semver() -> None:
    assert __version__ == "2.0.0"
    # Structural sanity: must parse as MAJOR.MINOR.PATCH
    assert re.fullmatch(r"\d+\.\d+\.\d+", __version__) is not None


# ---------------------------------------------------------------------------
# EclError shape
# ---------------------------------------------------------------------------


def test_eclerror_carries_code() -> None:
    err = EclError("USAGE", "test message")
    assert err.code == "USAGE"
    assert str(err) == "test message"
    assert err.gate is None
    assert err.phase is None


def test_eclerror_carries_optional_gate_and_phase() -> None:
    err = EclError("SCHEMA_MISMATCH", "bad", gate="E-1.1", phase="py-jsonschema")
    assert err.code == "SCHEMA_MISMATCH"
    assert err.gate == "E-1.1"
    assert err.phase == "py-jsonschema"


def test_eclerror_chains_cause() -> None:
    cause = ValueError("root cause")
    err = EclError("IO_FAILED", "wrapped", cause=cause)
    assert err.__cause__ is cause


# ---------------------------------------------------------------------------
# CLI sub-command registration
# ---------------------------------------------------------------------------

_EXPECTED_SUBCOMMANDS = ["eval", "migrate", "a2a-card", "a2a-translate", "compose-gen"]


def test_subcommands_registered() -> None:
    """All planned sub-commands must appear in --help output."""
    result = subprocess.run(
        [sys.executable, "-m", "eidolons_ecl", "--help"],
        capture_output=True,
        text=True,
    )
    # argparse prints help to stdout and exits 0.
    assert result.returncode == 0
    help_text = result.stdout
    for cmd in _EXPECTED_SUBCOMMANDS:
        assert cmd in help_text, f"sub-command '{cmd}' missing from --help output"


# ---------------------------------------------------------------------------
# Stub functions raise NotImplementedError with story label
# ---------------------------------------------------------------------------

# All CLI sub-commands are now implemented — no more NotImplementedError stubs
# (cmd_a2a_card and cmd_a2a_translate landed in S2.4).

# ---------------------------------------------------------------------------
# main() exits non-zero when no sub-command given
# ---------------------------------------------------------------------------


def test_main_exits_nonzero_on_no_subcommand() -> None:
    """argparse required=True means missing sub-command -> SystemExit(2)."""
    with pytest.raises(SystemExit) as exc_info:
        main([])
    assert exc_info.value.code != 0
