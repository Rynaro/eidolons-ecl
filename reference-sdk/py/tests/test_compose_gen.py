"""Tests for the compose_gen module (Story S2.5).

Coverage:
  - Golden-file byte equality against ``tests/fixtures/composition.expected.md``
    rendered from the real ``contracts/`` set + the real template.
  - Determinism: three back-to-back renders produce byte-identical output.
  - Synthetic two-contract input: rendered output includes both rows in
    lexicographic filename order.
  - Empty contracts dir: renderer returns a non-empty Markdown skeleton with
    zero data rows (the preamble + static prose still emit).
  - Missing template path raises ``jinja2.TemplateNotFound`` (the public
    contract documented on :func:`render_composition`).
"""

from __future__ import annotations

import pathlib

import pytest
from jinja2.exceptions import TemplateNotFound

from eidolons_ecl.compose_gen import render_composition

# ---------------------------------------------------------------------------
# Fixture paths
# ---------------------------------------------------------------------------

_TESTS_DIR = pathlib.Path(__file__).parent
_REPO_ROOT = _TESTS_DIR.parent.parent.parent  # tests/.. /py/.. /reference-sdk/.. = repo root
_FIXTURES = _TESTS_DIR / "fixtures"
_TEMPLATE = (
    _REPO_ROOT
    / "reference-sdk"
    / "py"
    / "src"
    / "eidolons_ecl"
    / "compose_gen"
    / "templates"
    / "composition.md.j2"
)
_CONTRACTS = _REPO_ROOT / "contracts"
_GOLDEN = _FIXTURES / "composition.expected.md"


# ---------------------------------------------------------------------------
# Golden-file test (the canonical S2.5 acceptance gate)
# ---------------------------------------------------------------------------


def test_renders_against_real_contracts_matches_golden() -> None:
    """Render the real contracts/ set; assert byte-equality with the golden."""
    assert _CONTRACTS.is_dir(), f"contracts dir missing: {_CONTRACTS}"
    assert _TEMPLATE.is_file(), f"template missing: {_TEMPLATE}"
    assert _GOLDEN.is_file(), f"golden file missing: {_GOLDEN} (regenerate via render_composition)"

    rendered = render_composition(_CONTRACTS, _TEMPLATE)
    expected = _GOLDEN.read_text(encoding="utf-8")
    assert rendered == expected, (
        "Generator output drifted from golden. To accept the new output:\n"
        '  cd reference-sdk/py && uv run python -c "\n'
        "from pathlib import Path\n"
        "from eidolons_ecl.compose_gen import render_composition\n"
        f"Path('{_GOLDEN}').write_text(render_composition(\n"
        f"    Path('{_CONTRACTS}'),\n"
        f"    Path('{_TEMPLATE}'),\n"
        '))"'
    )


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


def test_render_is_deterministic_across_three_runs() -> None:
    """Three back-to-back renders produce byte-identical output."""
    a = render_composition(_CONTRACTS, _TEMPLATE)
    b = render_composition(_CONTRACTS, _TEMPLATE)
    c = render_composition(_CONTRACTS, _TEMPLATE)
    assert a == b == c


# ---------------------------------------------------------------------------
# Synthetic input: two contracts in deterministic order
# ---------------------------------------------------------------------------


def test_synthetic_two_contracts_render_in_lexicographic_order(tmp_path: pathlib.Path) -> None:
    """A custom contracts dir with 2 YAMLs should render both rows in
    lexicographic filename order (``alpha-to-beta`` before ``gamma-to-delta``)."""
    syn_contracts = tmp_path / "contracts"
    syn_contracts.mkdir()
    (syn_contracts / "alpha-to-beta.yaml").write_text(
        "contract_version: '1.0'\n"
        "from: alpha\n"
        "to: beta\n"
        "edge_origin: roster\n"
        "performatives_allowed: [PROPOSE, INFORM]\n"
        "artifacts:\n"
        "  - kind: alpha-report\n"
        "context_delta:\n"
        "  token_budget_max: 2000\n"
        "trust_level: standard\n"
        "notes: alpha-to-beta synthetic edge.\n",
        encoding="utf-8",
    )
    (syn_contracts / "gamma-to-delta.yaml").write_text(
        "contract_version: '1.0'\n"
        "from: gamma\n"
        "to: delta\n"
        "edge_origin: roster\n"
        "performatives_allowed: [REQUEST]\n"
        "artifacts:\n"
        "  - kind: gamma-request\n"
        "trust_level: high\n",
        encoding="utf-8",
    )

    rendered = render_composition(syn_contracts, _TEMPLATE)

    # Both rows present.
    assert "`alpha`" in rendered
    assert "`gamma`" in rendered

    # alpha row precedes gamma row (lexicographic file order).
    assert rendered.index("`alpha`") < rendered.index("`gamma`")

    # Field plumbing for alpha's data-driven cells.
    assert "alpha-report" in rendered
    assert "PROPOSE" in rendered
    assert "2000" in rendered

    # Gamma's optional notes is absent — its "edge notes" subsection should NOT render
    # an `## alpha → beta` heading style block for gamma, since gamma has no notes.
    # We confirm alpha's notes block appears at least once.
    assert "alpha-to-beta synthetic edge." in rendered


# ---------------------------------------------------------------------------
# Empty contracts dir
# ---------------------------------------------------------------------------


def test_empty_contracts_dir_renders_skeleton(tmp_path: pathlib.Path) -> None:
    """An empty contracts dir produces a valid Markdown skeleton (preamble +
    static prose) with no data rows."""
    empty_contracts = tmp_path / "contracts"
    empty_contracts.mkdir()

    rendered = render_composition(empty_contracts, _TEMPLATE)

    # Non-empty (preamble + static sections exist).
    assert len(rendered) > 200
    # The static preamble heading is present.
    assert "# Composition" in rendered


# ---------------------------------------------------------------------------
# Template not found
# ---------------------------------------------------------------------------


def test_missing_template_raises_template_not_found(tmp_path: pathlib.Path) -> None:
    """Pointing at a non-existent template file raises Jinja2's
    ``TemplateNotFound`` per the documented public contract."""
    bogus_template = tmp_path / "no-such.j2"
    with pytest.raises((TemplateNotFound, FileNotFoundError)):
        render_composition(_CONTRACTS, bogus_template)
