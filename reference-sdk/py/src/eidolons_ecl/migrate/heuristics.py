"""Filename-pattern heuristics for migration artefact classification — Story S2.2.

Maps filename glob patterns to (from_eidolon, artifact_kind) pairs.
Patterns are tested in order; first match wins.

``classify(path)`` returns ``(from_eidolon, kind)`` or ``None`` when no
pattern matches (caller should skip the file with a ``skipped_unknown`` entry).
"""

from __future__ import annotations

import fnmatch
from pathlib import Path

# ---------------------------------------------------------------------------
# Match rule table
# ---------------------------------------------------------------------------

# Each entry is (glob_pattern, from_eidolon, kind).
# Patterns are tested in order; first match wins.
# The glob is applied to the **filename** (not the full path).  Directory
# membership rules (e.g. ``files inside .spectra/``) are applied separately
# in ``classify()`` after the glob table is exhausted.

MATCH_RULES: list[tuple[str, str, str]] = [
    # Specific report kinds first (more precise patterns first).
    ("*scout-report*.md", "atlas", "scout-report"),
    ("*completion-report*.md", "apivr", "apivr-completion-report"),
    ("*repair-failed-report*.md", "apivr", "repair-failed-report"),
    ("*root-cause-report*.md", "vigil", "root-cause-report"),
    ("*reasoning-report*.md", "forge", "reasoning-report"),
    ("*reasoning-request*.md", "apivr", "reasoning-request"),
    ("*chronicle*.md", "idg", "chronicle"),
    # Broad spec pattern last (catches remaining *.md in .spectra/ dirs).
    ("*spec*.md", "spectra", "spec"),
]


def classify(path: Path) -> tuple[str, str] | None:
    """Classify *path* into (from_eidolon, artifact_kind) or return None.

    Classification order:
    1. Walk ``MATCH_RULES`` in order; apply each glob against the filename.
    2. If no glob matches but the file lives inside a ``.spectra/`` directory
       (any depth), classify as ``(spectra, spec)``.
    3. If no glob matches but the file lives inside an ``.atlas-scout/``
       directory, classify as ``(atlas, scout-report)``.
    4. Otherwise return ``None`` (caller should emit a ``skipped_unknown``
       entry).
    """
    filename = path.name

    for pattern, from_eidolon, kind in MATCH_RULES:
        if fnmatch.fnmatch(filename, pattern):
            return (from_eidolon, kind)

    # Directory-membership fallback rules.
    parts = {p.lower() for p in path.parts}
    if ".spectra" in parts:
        return ("spectra", "spec")
    if ".atlas-scout" in parts:
        return ("atlas", "scout-report")

    return None
