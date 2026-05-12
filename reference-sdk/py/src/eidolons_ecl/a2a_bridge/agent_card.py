"""Emit an A2A Agent Card from the Eidolons nexus roster.

The Agent Card schema follows the A2A specification (https://a2a.dev).  We
emit a minimal but structurally consistent subset — enough for a host
system to understand the Eidolons team's capabilities and route work to the
correct member.  Full schema compliance is not required (the bridge is
read-only; no HTTP listener exists).

``schemaVersion`` choice: the A2A Agent Card specification uses a
``schemaVersion`` string to declare which version of the card schema the
document conforms to.  We use ``"1.0"`` as the baseline because the A2A
spec at https://a2a.dev/specs/agent-card was at v0/1.0 when this bridge
was written (2026-05-12).  Consumers SHOULD treat this field as informational
only; it does NOT track the ECL spec version.

Story: S2.4 — Phase 2.B.
"""

from __future__ import annotations

import pathlib
from typing import Any

import yaml  # type: ignore[import-untyped]

# A2A Agent Card schema version this module targets.  Stable baseline that
# matches the spec as of 2026-05-12; bump if the upstream schema changes in a
# breaking way and we adopt the new shape.
_A2A_SCHEMA_VERSION = "1.0"

# ECL spec version targeted by this SDK — used as the aggregate card version
# since the bridge is part of the ECL 1.2 SDK.
_ECL_VERSION_TARGET = "1.2"


def _parse_roster(roster_path: pathlib.Path) -> dict[str, Any]:
    """Read and parse the roster YAML.  Returns the top-level dict."""
    raw: Any = yaml.safe_load(roster_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Roster is not a YAML mapping: {roster_path}")
    return raw  # type: ignore[return-value]


def _member_card(entry: dict[str, Any]) -> dict[str, object]:
    """Convert one roster entry into an A2A member descriptor."""
    name: str = str(entry.get("name", ""))
    display_name: str = str(entry.get("display_name") or name)

    methodology: dict[str, Any] = entry.get("methodology") or {}
    summary: str = str(methodology.get("summary") or "")
    cycle: str = str(methodology.get("cycle") or "")

    description = f"{display_name} — {summary}" if summary else display_name

    versions: dict[str, Any] = entry.get("versions") or {}
    version: str = str(versions.get("latest", "n/a"))

    capability_class: str = str(entry.get("capability_class") or "")

    handoffs: dict[str, Any] = entry.get("handoffs") or {}
    downstream: list[Any] = handoffs.get("downstream") or []
    lateral: list[Any] = handoffs.get("lateral") or []

    skills: list[dict[str, str]] = [
        {"description": f"Hand off to {dst}", "name": str(dst)}
        for dst in downstream
    ]

    return {
        "capability_class": capability_class,
        "description": description,
        "lateral_consultants": [str(x) for x in lateral],
        "methodology_cycle": cycle,
        "name": name,
        "skills": skills,
        "version": version,
    }


def emit_agent_card(
    roster_path: pathlib.Path,
    *,
    organization: str = "eidolons",
    aggregate_name: str = "eidolons-aggregate",
) -> dict[str, object]:
    """Emit an A2A Agent Card for the Eidolons team aggregate.

    Parameters
    ----------
    roster_path:
        Path to ``roster/index.yaml`` (or any roster-shaped YAML).
    organization:
        Value for the top-level ``organization`` field.  Defaults to
        ``"eidolons"``.
    aggregate_name:
        Value for the top-level ``name`` field.  Defaults to
        ``"eidolons-aggregate"``.

    Returns
    -------
    dict[str, object]
        A2A Agent Card as a plain Python dict.  Serialise with
        ``json.dumps(card, sort_keys=True, indent=2)`` for deterministic
        output.

    Raises
    ------
    FileNotFoundError
        If *roster_path* does not exist.
    ValueError
        If the roster YAML is not a mapping.
    yaml.YAMLError
        If the file contains invalid YAML.
    """
    roster = _parse_roster(roster_path)
    eidolons: list[Any] = roster.get("eidolons") or []

    members: list[dict[str, object]] = [
        _member_card(e) for e in eidolons if isinstance(e, dict)
    ]

    return {
        "description": (
            "Aggregate of the Eidolons team. Each Eidolon is a specialised LLM agent; "
            "this card surfaces the team-level entry point. "
            "Each individual Eidolon is described in `members`."
        ),
        "endpoints": [],  # read-only bridge; no HTTP listener
        "members": members,
        "name": aggregate_name,
        "organization": organization,
        "schemaVersion": _A2A_SCHEMA_VERSION,
        "version": _ECL_VERSION_TARGET,
    }
