"""Back-fill v1.0 ECL envelopes for legacy artefacts — Story S2.2.

Walks ``.spectra/``, ``.atlas-scout/``, and the root directory supplied by
the caller; for every ``.md`` file that matches a known pattern and does
not already have a ``<file>.envelope.json`` sidecar, generates and writes a
conformant v1.0 envelope.

Idempotence contract: if ``<file>.envelope.json`` already exists, the
file is skipped (``status="skipped_existing"``).  A second call on the same
directory will always produce ``created_count == 0``.

UUIDv7 note: Python 3.14 stdlib will ship UUIDv7.  Below Python 3.14,
``uuid.uuid4()`` (random UUID) is used because adding an external
``uuid6``/``uuid7`` dependency is out of scope for this story.  Per the ECL
v1.0 schema, UUIDv7 is RECOMMENDED but UUIDv4 is conformant.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .heuristics import classify

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MigrationFileEntry:
    """Record of one file's migration outcome."""

    path: str          # relative to root_dir
    status: Literal["created", "skipped_existing", "skipped_unknown"]
    envelope_path: str | None   # relative to root_dir; None for skipped_unknown
    from_eidolon: str | None
    kind: str | None
    reason: str | None          # explanatory text for skipped entries


@dataclass(frozen=True)
class MigrationReport:
    """Aggregated report for a ``backfill_directory()`` run."""

    root_dir: str
    scanned_count: int
    created_count: int
    skipped_existing_count: int
    skipped_unknown_count: int
    entries: list[MigrationFileEntry]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_ECL_ENVELOPE_VERSION = "1.0"
_CONTEXT_DELTA_TOKEN_BUDGET = 4000


def _mtime_rfc3339(path: Path) -> str:
    """Return the file's modification time as an RFC 3339 UTC timestamp."""
    mtime = path.stat().st_mtime
    dt = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc)
    # Format: 2026-05-09T12:34:56Z  (no sub-second precision needed)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _sha256_hex(path: Path) -> str:
    """Compute the lowercase hex SHA-256 digest of *path*'s bytes."""
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    return h


def _extract_objective(path: Path) -> str:
    """Return the first Markdown H1 heading text, or the stem as fallback.

    Falls back to the filename without extension if no ``# Heading`` line
    is found.  The result is capped at 240 characters to satisfy ECL §1.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return path.stem[:240]

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            heading = stripped[2:].strip()
            return heading[:240] if heading else path.stem[:240]

    return path.stem[:240]


def _build_envelope(
    md_path: Path,
    root_dir: Path,
    from_eidolon: str,
    kind: str,
    sha256: str,
) -> dict[str, object]:
    """Construct the v1.0 envelope dict for *md_path*.

    All keys are sorted to produce deterministic JSON output.
    The returned dict is ready to be serialised with ``json.dumps``.
    """
    msg_id = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())
    mtime_ts = _mtime_rfc3339(md_path)
    size_bytes = md_path.stat().st_size
    objective = _extract_objective(md_path)
    basename = md_path.name

    # Build the envelope.  Key ordering follows the ECL spec §1 table order
    # so that generated JSON is predictable and readable.
    envelope: dict[str, object] = {
        "envelope_version": _ECL_ENVELOPE_VERSION,
        "message_id": msg_id,
        "thread_id": thread_id,
        "parent_id": None,
        "from": {
            "eidolon": from_eidolon,
            "version": "n/a",
        },
        "to": {
            "eidolon": "orchestrator",
            "version": "n/a",
        },
        "performative": "INFORM",
        "edge_origin": "implicit",
        "objective": objective,
        "artifact": {
            "kind": kind,
            "schema_version": "1.0",
            "path": basename,
            "sha256": sha256,
            "size_bytes": size_bytes,
        },
        "context_delta": {
            "token_budget": _CONTEXT_DELTA_TOKEN_BUDGET,
            "tokens_used": 0,
            "input_handles": [],
            "summary": "Back-filled by eidolons-ecl migrate; historical artefact.",
        },
        "constraints": {
            "trust_level": "standard",
        },
        "integrity": {
            "method": "sha256",
            "value": sha256,
        },
        "trace": {
            "ts": mtime_ts,
            "host": "migrated",
            "model": "unknown",
            "tier": "standard",
        },
        "confidence": 0.5,
        "assumptions": [
            "Back-filled envelope; from.eidolon inferred via filename pattern.",
        ],
        "expected_response": {
            "performative": "ACKNOWLEDGE",
        },
    }

    return envelope


def _find_md_files(root_dir: Path) -> list[Path]:
    """Collect all ``.md`` files to consider for migration.

    Searches:
    - ``<root_dir>/.spectra/`` (recursive)
    - ``<root_dir>/.atlas-scout/`` (recursive)
    - ``<root_dir>/*.md`` (top-level only, non-recursive)

    Files whose names end in ``.envelope.json`` are not ``.md`` files so
    they are never collected here.  The result list is sorted for
    deterministic iteration order.
    """
    candidates: set[Path] = set()

    # Scan known subdirectories recursively.
    for sub in (".spectra", ".atlas-scout"):
        subdir = root_dir / sub
        if subdir.is_dir():
            for md in subdir.rglob("*.md"):
                if md.is_file():
                    candidates.add(md)

    # Top-level .md files (non-recursive — avoids traversing .spectra twice).
    for md in root_dir.glob("*.md"):
        if md.is_file():
            candidates.add(md)

    return sorted(candidates)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def backfill_directory(root_dir: Path, dry_run: bool = False) -> MigrationReport:
    """Walk *root_dir* and back-fill v1.0 envelopes for legacy artefacts.

    Parameters
    ----------
    root_dir:
        Project root to scan.  Must be a directory.
    dry_run:
        When ``True``, the report is fully populated but **no files are
        written to disk**.

    Returns
    -------
    MigrationReport
        Aggregated results; ``created_count`` is 0 on idempotent re-runs.

    Raises
    ------
    NotADirectoryError
        If *root_dir* does not exist or is not a directory.
    """
    if not root_dir.is_dir():
        raise NotADirectoryError(f"root_dir is not a directory: {root_dir}")

    md_files = _find_md_files(root_dir)

    entries: list[MigrationFileEntry] = []
    created_count = 0
    skipped_existing_count = 0
    skipped_unknown_count = 0

    for md_path in md_files:
        try:
            rel_path = md_path.relative_to(root_dir)
        except ValueError:
            rel_path = md_path  # fallback; should not happen

        rel_str = str(rel_path)
        envelope_file = md_path.parent / (md_path.name + ".envelope.json")
        envelope_rel = str(envelope_file.relative_to(root_dir))

        # 1. Check for pre-existing envelope sidecar.
        if envelope_file.exists():
            entries.append(
                MigrationFileEntry(
                    path=rel_str,
                    status="skipped_existing",
                    envelope_path=envelope_rel,
                    from_eidolon=None,
                    kind=None,
                    reason="Envelope sidecar already exists.",
                )
            )
            skipped_existing_count += 1
            continue

        # 2. Attempt heuristic classification.
        classification = classify(md_path)
        if classification is None:
            entries.append(
                MigrationFileEntry(
                    path=rel_str,
                    status="skipped_unknown",
                    envelope_path=None,
                    from_eidolon=None,
                    kind=None,
                    reason="No matching filename pattern; skipped.",
                )
            )
            skipped_unknown_count += 1
            continue

        from_eidolon, kind = classification

        # 3. Build envelope and (if not dry_run) write to disk.
        sha256 = _sha256_hex(md_path)
        envelope = _build_envelope(md_path, root_dir, from_eidolon, kind, sha256)

        if not dry_run:
            envelope_file.write_text(
                json.dumps(envelope, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

        entries.append(
            MigrationFileEntry(
                path=rel_str,
                status="created",
                envelope_path=envelope_rel,
                from_eidolon=from_eidolon,
                kind=kind,
                reason=None,
            )
        )
        created_count += 1

    return MigrationReport(
        root_dir=str(root_dir),
        scanned_count=len(md_files),
        created_count=created_count,
        skipped_existing_count=skipped_existing_count,
        skipped_unknown_count=skipped_unknown_count,
        entries=entries,
    )


# ---------------------------------------------------------------------------
# Markdown report renderer
# ---------------------------------------------------------------------------


def render_markdown(report: MigrationReport) -> str:
    """Render a ``MigrationReport`` as a human-readable Markdown document.

    Pure function — no timestamps, no random output — so the result is
    deterministic for identical inputs.
    """
    lines: list[str] = [
        "# ECL Migration Report",
        "",
        f"**Root directory:** `{report.root_dir}`  ",
        "",
        "## Summary",
        "",
        "| Metric | Count |",
        "| --- | --- |",
        f"| Scanned | {report.scanned_count} |",
        f"| Created | {report.created_count} |",
        f"| Skipped (existing) | {report.skipped_existing_count} |",
        f"| Skipped (unknown) | {report.skipped_unknown_count} |",
        "",
        "## File Entries",
        "",
    ]

    if not report.entries:
        lines.append("*No files found.*")
    else:
        lines.append("| Path | Status | From Eidolon | Kind | Note |")
        lines.append("| --- | --- | --- | --- | --- |")
        for entry in report.entries:
            from_col = entry.from_eidolon or "—"
            kind_col = entry.kind or "—"
            note_col = entry.reason or (
                f"→ `{entry.envelope_path}`" if entry.envelope_path else ""
            )
            lines.append(
                f"| `{entry.path}` | {entry.status} | {from_col} | {kind_col} | {note_col} |"
            )

    lines.append("")
    return "\n".join(lines)
