"""Scaffold smoke tests — Story S2.A.0.

These tests run inside the dev container via ``make test`` and exercise only
the stable surface committed in this story: version constants, EclError shape,
and CLI sub-command registration.
"""

from __future__ import annotations

import re
import subprocess
import sys
import types
from collections.abc import Callable

import pytest

from eidolons_ecl import ECL_VERSION_TARGET, EclError
from eidolons_ecl.__main__ import (
    cmd_a2a_card,
    cmd_a2a_translate,
    main,
)
from eidolons_ecl.version import __version__

# Stub function type: takes a Namespace, returns int (but actually raises).
_StubFn = Callable[[types.SimpleNamespace], int]

# ---------------------------------------------------------------------------
# Version constants
# ---------------------------------------------------------------------------


def test_ecl_version_target_equals_1_2() -> None:
    assert ECL_VERSION_TARGET == "1.2"


def test_version_is_semver() -> None:
    assert __version__ == "1.2.0"
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

_STUB_CASES: list[tuple[_StubFn, str, str]] = [
    # cmd_eval is implemented in S2.1 — no longer a stub.
    # cmd_migrate is implemented in S2.2 — no longer a stub.
    # cmd_compose_gen is implemented in S2.5 — no longer a stub.
    (cmd_a2a_card, "S2.4", "cmd_a2a_card"),
    (cmd_a2a_translate, "S2.4", "cmd_a2a_translate"),
]


@pytest.mark.parametrize(
    "func,label",
    [(fn, lbl) for fn, lbl, _ in _STUB_CASES],
    ids=[name for _, _, name in _STUB_CASES],
)
def test_each_subcommand_raises_not_implemented(func: _StubFn, label: str) -> None:
    """Every stub raises NotImplementedError mentioning the story label."""
    with pytest.raises(NotImplementedError) as exc_info:
        func(types.SimpleNamespace())
    assert label in str(exc_info.value), (
        f"Expected story label '{label}' in NotImplementedError message, got: {exc_info.value!r}"
    )


# ---------------------------------------------------------------------------
# main() exits non-zero when no sub-command given
# ---------------------------------------------------------------------------


def test_main_exits_nonzero_on_no_subcommand() -> None:
    """argparse required=True means missing sub-command -> SystemExit(2)."""
    with pytest.raises(SystemExit) as exc_info:
        main([])
    assert exc_info.value.code != 0
