"""Render ``methodology/composition.md`` from ECL hand-off contracts.

The generator:

1. Loads every ``*.yaml`` under *contracts_dir* (top-level only; no
   subdirectory recursion) in ``LC_ALL=C`` lexicographic filename order.
2. Parses each file via ``yaml.safe_load`` (PyYAML).
3. Passes the normalised contract list to a Jinja2 template.
4. Returns the rendered Markdown string; no trailing-newline manipulation
   — the template owns final formatting.

The output is deterministic for a fixed input set.  Running the generator
three times on the same directory and template produces byte-identical
results.
"""

from __future__ import annotations

import pathlib
from typing import Any

import yaml  # type: ignore[import-untyped]
from jinja2 import Environment, FileSystemLoader, StrictUndefined

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_contracts(contracts_dir: pathlib.Path) -> list[dict[str, Any]]:
    """Load and normalise all ``*.yaml`` files in *contracts_dir*.

    Files are read in ``LC_ALL=C`` lexicographic order (Python ``sorted()``
    on bare filenames, which matches ASCII lexicographic order for the
    ASCII-only filenames used in ``contracts/``).

    Each raw YAML dict is normalised into a flat record carrying:

    ``from``
        Sender slug (str).
    ``to``
        Receiver slug (str).
    ``edge_origin``
        Origin tag — e.g. ``"roster"`` (str, default ``""``).
    ``performatives_allowed``
        List of performative strings (list[str], default ``[]``).
    ``artifact_kinds``
        List of artifact kind strings derived from ``artifacts[*].kind``
        (list[str], default ``[]``).
    ``trust_level``
        Trust level string (str, default ``"standard"``).
    ``token_budget_max``
        Max token budget from ``context_delta.token_budget_max``, or
        ``None`` if absent / null.
    ``notes``
        Free-text notes string (str, default ``""``).
    """
    yaml_files = sorted(p for p in contracts_dir.iterdir() if p.suffix == ".yaml" and p.is_file())

    records: list[dict[str, Any]] = []
    for path in yaml_files:
        raw: Any = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            continue

        # Normalise artifact kinds.
        artifacts: list[Any] = raw.get("artifacts") or []
        artifact_kinds: list[str] = []
        for art in artifacts:
            if isinstance(art, dict):
                kind = art.get("kind")
                if isinstance(kind, str):
                    artifact_kinds.append(kind)

        # Normalise performatives.
        performatives_raw: Any = raw.get("performatives_allowed") or []
        performatives: list[str] = [p for p in performatives_raw if isinstance(p, str)]

        # Normalise context_delta.
        context_delta: Any = raw.get("context_delta") or {}
        token_budget_max: int | None = None
        if isinstance(context_delta, dict):
            val = context_delta.get("token_budget_max")
            if isinstance(val, int):
                token_budget_max = val

        records.append(
            {
                "from": str(raw.get("from", "")),
                "to": str(raw.get("to", "")),
                "edge_origin": str(raw.get("edge_origin", "")),
                "performatives_allowed": performatives,
                "artifact_kinds": artifact_kinds,
                "trust_level": str(raw.get("trust_level", "standard")),
                "token_budget_max": token_budget_max,
                "notes": str(raw.get("notes", "") or ""),
            }
        )

    return records


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def render_composition(
    contracts_dir: pathlib.Path,
    template_path: pathlib.Path,
) -> str:
    """Render the composition Markdown from ECL hand-off contracts.

    Parameters
    ----------
    contracts_dir:
        Directory containing ``*.yaml`` hand-off contract files.  Only
        top-level files with the ``.yaml`` extension are considered; no
        subdirectory recursion.
    template_path:
        Absolute or relative path to a Jinja2 ``.j2`` template file.  The
        template receives one variable: ``contracts`` — a list of
        normalised contract dicts (see :func:`_load_contracts`).

    Returns
    -------
    str
        Rendered Markdown string.  Trailing-newline handling is delegated
        to the template.

    Raises
    ------
    FileNotFoundError
        If *contracts_dir* does not exist or *template_path* is not found.
    jinja2.TemplateNotFound
        If *template_path* does not match a template in its parent directory.
    yaml.YAMLError
        If any contract file contains invalid YAML.
    """
    contracts: list[dict[str, object]] = _load_contracts(contracts_dir)

    env = Environment(
        loader=FileSystemLoader(str(template_path.parent)),
        undefined=StrictUndefined,
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template(template_path.name)
    return template.render(contracts=contracts)
