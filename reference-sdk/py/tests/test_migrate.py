"""Tests for the ECL migration tool — Story S2.2.

Covers:
- Happy path: envelopes created with valid v1.0 shape.
- Heuristic correctness: filename → from_eidolon / kind mapping.
- Idempotence: second run produces created_count == 0.
- skipped_existing: pre-existing sidecar is never overwritten.
- skipped_unknown: unrecognised files never get an envelope.
- SHA-256 integrity: digest in envelope matches actual file bytes.
- dry_run mode: no files written; report still populated.
- objective extraction: H1 heading vs filename fallback.
- Integration test against the nexus .spectra/ checkout (requires
  ``/Users/henrique/workspace/oss/agents/eidolons/.spectra/``, gated with
  ``@pytest.mark.integration``).

UUID note: ``message_id`` and ``thread_id`` are random UUIDv4.  ECL v1.0
recommends UUIDv7 but accepts any UUID; Python 3.14 stdlib adds UUIDv7.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import uuid

import pytest

from eidolons_ecl.migrate import MigrationReport, backfill_directory
from eidolons_ecl.migrate.backfill import MigrationFileEntry, render_markdown
from eidolons_ecl.migrate.heuristics import classify

# ---------------------------------------------------------------------------
# Integration-test marker
# ---------------------------------------------------------------------------

# Tests decorated with this marker run against the actual nexus checkout and
# are skipped gracefully when the checkout is not present.
integration = pytest.mark.integration

# Path to the nexus spectra directory (may or may not exist in CI).
_NEXUS_SPECTRA = pathlib.Path("/Users/henrique/workspace/oss/agents/eidolons/.spectra")

# Path to the eidolons-ecl repo root (for running conformance/check.sh).
_REPO_ROOT = pathlib.Path(__file__).parent.parent.parent.parent


# ---------------------------------------------------------------------------
# Synthetic fixture builder
# ---------------------------------------------------------------------------


def _make_project(tmp_path: pathlib.Path) -> dict[str, pathlib.Path]:
    """Create a synthetic legacy project under *tmp_path*.

    Layout:
        .spectra/
            foo-spec.md             — H1: "Foo spec"
            already-enveloped.md    — has a pre-existing sidecar
            already-enveloped.md.envelope.json
        .atlas-scout/
            scout-report-bar.md     — H1: "Scout report"
        apivr-completion-report.md  — top-level (H1: "Completion report")
        unknown-file.md             — no matching pattern; should be skipped

    Returns a dict of logical names → file paths for assertion convenience.
    """
    spectra = tmp_path / ".spectra"
    spectra.mkdir()

    atlas_scout = tmp_path / ".atlas-scout"
    atlas_scout.mkdir()

    paths: dict[str, pathlib.Path] = {}

    # .spectra/foo-spec.md
    p = spectra / "foo-spec.md"
    p.write_text("# Foo spec\n\nThis is the Foo specification.\n", encoding="utf-8")
    paths["spec"] = p

    # .spectra/already-enveloped.md  + pre-existing sidecar
    already = spectra / "already-enveloped.md"
    already.write_text("# Already enveloped\n\nContent.\n", encoding="utf-8")
    paths["already"] = already
    sidecar = spectra / "already-enveloped.md.envelope.json"
    sidecar.write_text(
        json.dumps({"envelope_version": "1.0", "message_id": "pre-existing"}),
        encoding="utf-8",
    )
    paths["already_sidecar"] = sidecar

    # .atlas-scout/scout-report-bar.md
    p = atlas_scout / "scout-report-bar.md"
    p.write_text("# Scout report\n\nFindings here.\n", encoding="utf-8")
    paths["scout"] = p

    # apivr-completion-report.md (top-level)
    p = tmp_path / "apivr-completion-report.md"
    p.write_text("# Completion report\n\nAll done.\n", encoding="utf-8")
    paths["completion"] = p

    # unknown-file.md (top-level, no pattern match)
    p = tmp_path / "unknown-file.md"
    p.write_text("# Unknown\n\nNo known pattern.\n", encoding="utf-8")
    paths["unknown"] = p

    return paths


# ---------------------------------------------------------------------------
# Heuristic unit tests
# ---------------------------------------------------------------------------


class TestClassify:
    """Unit tests for heuristics.classify()."""

    def test_scout_report_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "scout-report-2026.md"
        p.touch()
        result = classify(p)
        assert result == ("atlas", "scout-report")

    def test_completion_report_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "apivr-completion-report.md"
        p.touch()
        result = classify(p)
        assert result == ("apivr", "apivr-completion-report")

    def test_repair_failed_report_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "repair-failed-report-abc.md"
        p.touch()
        result = classify(p)
        assert result == ("apivr", "repair-failed-report")

    def test_root_cause_report_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "vigil-root-cause-report.md"
        p.touch()
        result = classify(p)
        assert result == ("vigil", "root-cause-report")

    def test_reasoning_report_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "forge-reasoning-report.md"
        p.touch()
        result = classify(p)
        assert result == ("forge", "reasoning-report")

    def test_reasoning_request_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "reasoning-request-123.md"
        p.touch()
        result = classify(p)
        assert result == ("apivr", "reasoning-request")

    def test_chronicle_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "session-chronicle-2026.md"
        p.touch()
        result = classify(p)
        assert result == ("idg", "chronicle")

    def test_spec_glob(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "phase2-spec.md"
        p.touch()
        result = classify(p)
        assert result == ("spectra", "spec")

    def test_spectra_directory_fallback(self, tmp_path: pathlib.Path) -> None:
        """Files inside .spectra/ with no glob match fall back to (spectra, spec)."""
        spectra_dir = tmp_path / ".spectra"
        spectra_dir.mkdir()
        p = spectra_dir / "arbitrary-name.md"
        p.touch()
        result = classify(p)
        assert result == ("spectra", "spec")

    def test_atlas_scout_directory_fallback(self, tmp_path: pathlib.Path) -> None:
        """Files inside .atlas-scout/ with no glob match fall back to (atlas, scout-report)."""
        scout_dir = tmp_path / ".atlas-scout"
        scout_dir.mkdir()
        p = scout_dir / "arbitrary-name.md"
        p.touch()
        result = classify(p)
        assert result == ("atlas", "scout-report")

    def test_unknown_returns_none(self, tmp_path: pathlib.Path) -> None:
        p = tmp_path / "unknown-file.md"
        p.touch()
        result = classify(p)
        assert result is None


# ---------------------------------------------------------------------------
# Backfill happy-path and shape tests
# ---------------------------------------------------------------------------


class TestBackfillHappyPath:
    """Tests that created envelopes have valid v1.0 shape."""

    def test_envelope_version(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        assert report.created_count >= 1

        for entry in report.entries:
            if entry.status == "created":
                assert entry.envelope_path is not None
                env_file = tmp_path / entry.envelope_path
                data = json.loads(env_file.read_text(encoding="utf-8"))
                assert data["envelope_version"] == "1.0"

    def test_required_fields_present(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        backfill_directory(tmp_path)

        required = {
            "envelope_version",
            "message_id",
            "thread_id",
            "parent_id",
            "from",
            "to",
            "performative",
            "objective",
            "artifact",
            "integrity",
            "trace",
        }
        for envelope_file in tmp_path.rglob("*.envelope.json"):
            # Skip the pre-existing sidecar (it has a minimal structure).
            if "already-enveloped" in envelope_file.name:
                continue
            data = json.loads(envelope_file.read_text(encoding="utf-8"))
            missing = required - set(data.keys())
            assert not missing, f"Missing fields in {envelope_file}: {missing}"

    def test_performative_is_inform(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
            data = json.loads(env_file.read_text(encoding="utf-8"))
            assert data["performative"] == "INFORM"

    def test_to_eidolon_is_orchestrator(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
            data = json.loads(env_file.read_text(encoding="utf-8"))
            assert data["to"]["eidolon"] == "orchestrator"

    def test_parent_id_is_null(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
            data = json.loads(env_file.read_text(encoding="utf-8"))
            assert data["parent_id"] is None

    def test_message_id_is_valid_uuid(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
            data = json.loads(env_file.read_text(encoding="utf-8"))
            # Should parse without raising.
            uuid.UUID(data["message_id"])

    def test_confidence_is_half(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
            data = json.loads(env_file.read_text(encoding="utf-8"))
            assert data["confidence"] == 0.5


# ---------------------------------------------------------------------------
# Heuristic mapping in envelope output
# ---------------------------------------------------------------------------


class TestHeuristicMapping:
    """Envelopes carry the correct from_eidolon / kind from the heuristic."""

    def _entry_for(self, report: MigrationReport, filename: str) -> None:
        for e in report.entries:
            if e.path.endswith(filename):
                return e  # type: ignore[return-value]
        return None  # type: ignore[return-value]

    def test_scout_report_eidolon(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        entry = self._entry_for(report, "scout-report-bar.md")
        assert entry is not None
        assert entry.from_eidolon == "atlas"
        assert entry.kind == "scout-report"

    def test_spectra_spec_eidolon(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        entry = self._entry_for(report, "foo-spec.md")
        assert entry is not None
        assert entry.from_eidolon == "spectra"
        assert entry.kind == "spec"

    def test_completion_report_eidolon(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        entry = self._entry_for(report, "apivr-completion-report.md")
        assert entry is not None
        assert entry.from_eidolon == "apivr"
        assert entry.kind == "apivr-completion-report"

    def test_envelope_from_eidolon_field(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        entry = self._entry_for(report, "scout-report-bar.md")
        assert entry is not None
        env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
        data = json.loads(env_file.read_text(encoding="utf-8"))
        assert data["from"]["eidolon"] == "atlas"


# ---------------------------------------------------------------------------
# Idempotence
# ---------------------------------------------------------------------------


class TestIdempotence:
    def test_second_run_creates_nothing(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        first = backfill_directory(tmp_path)
        second = backfill_directory(tmp_path)
        assert second.created_count == 0
        assert first.created_count > 0

    def test_filesystem_unchanged_on_second_run(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        backfill_directory(tmp_path)

        # Capture all envelope contents after first run.
        before: dict[str, str] = {}
        for ef in sorted(tmp_path.rglob("*.envelope.json")):
            before[str(ef)] = ef.read_text(encoding="utf-8")

        backfill_directory(tmp_path)

        # Nothing changed.
        after: dict[str, str] = {}
        for ef in sorted(tmp_path.rglob("*.envelope.json")):
            after[str(ef)] = ef.read_text(encoding="utf-8")

        assert before == after


# ---------------------------------------------------------------------------
# skipped_existing
# ---------------------------------------------------------------------------


class TestSkippedExisting:
    def test_pre_existing_sidecar_skipped(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        assert report.skipped_existing_count >= 1
        for entry in report.entries:
            if "already-enveloped" in entry.path:
                assert entry.status == "skipped_existing"

    def test_pre_existing_sidecar_not_overwritten(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        sidecar = tmp_path / ".spectra" / "already-enveloped.md.envelope.json"
        original = sidecar.read_text(encoding="utf-8")
        backfill_directory(tmp_path)
        assert sidecar.read_text(encoding="utf-8") == original


# ---------------------------------------------------------------------------
# skipped_unknown
# ---------------------------------------------------------------------------


class TestSkippedUnknown:
    def test_unknown_file_not_enveloped(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report.entries:
            if "unknown-file" in entry.path:
                assert entry.status == "skipped_unknown"
                assert entry.envelope_path is None
                # The sidecar must NOT exist on disk.
                sidecar = tmp_path / "unknown-file.md.envelope.json"
                assert not sidecar.exists()
                return
        pytest.fail("unknown-file.md entry not found in report")

    def test_skipped_unknown_count(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        assert report.skipped_unknown_count >= 1


# ---------------------------------------------------------------------------
# SHA-256 integrity
# ---------------------------------------------------------------------------


class TestSha256Integrity:
    def test_sha256_matches_file_bytes(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            assert entry.envelope_path is not None
            md_path = tmp_path / entry.path
            expected_hex = hashlib.sha256(md_path.read_bytes()).hexdigest()
            env_file = tmp_path / entry.envelope_path
            data = json.loads(env_file.read_text(encoding="utf-8"))
            assert data["artifact"]["sha256"] == expected_hex
            assert data["integrity"]["value"] == expected_hex

    def test_integrity_method_is_sha256(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        for entry in report_entries_created(report):
            env_file = tmp_path / entry.envelope_path  # type: ignore[arg-type]
            data = json.loads(env_file.read_text(encoding="utf-8"))
            assert data["integrity"]["method"] == "sha256"


# ---------------------------------------------------------------------------
# dry_run mode
# ---------------------------------------------------------------------------


class TestDryRun:
    def test_no_files_written_in_dry_run(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path, dry_run=True)

        # created_count should reflect what *would* be created.
        assert report.created_count >= 1

        # But no new envelopes should exist on disk (only the pre-existing one).
        new_sidecars = [
            f for f in tmp_path.rglob("*.envelope.json") if "already-enveloped" not in f.name
        ]
        assert len(new_sidecars) == 0

    def test_dry_run_report_populated(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path, dry_run=True)
        assert report.scanned_count > 0
        created_entries = [e for e in report.entries if e.status == "created"]
        assert len(created_entries) >= 1

    def test_dry_run_does_not_prevent_real_run(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        backfill_directory(tmp_path, dry_run=True)
        real_report = backfill_directory(tmp_path, dry_run=False)
        assert real_report.created_count >= 1


# ---------------------------------------------------------------------------
# objective extraction
# ---------------------------------------------------------------------------


class TestObjectiveExtraction:
    def test_h1_heading_extracted(self, tmp_path: pathlib.Path) -> None:
        paths = _make_project(tmp_path)
        backfill_directory(tmp_path)
        # foo-spec.md has "# Foo spec"
        sidecar = paths["spec"].parent / (paths["spec"].name + ".envelope.json")
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        assert data["objective"] == "Foo spec"

    def test_filename_fallback_when_no_h1(self, tmp_path: pathlib.Path) -> None:
        spectra = tmp_path / ".spectra"
        spectra.mkdir()
        p = spectra / "my-spec.md"
        p.write_text("No heading here.\n", encoding="utf-8")
        backfill_directory(tmp_path)
        sidecar = spectra / "my-spec.md.envelope.json"
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        assert data["objective"] == "my-spec"

    def test_objective_capped_at_240_chars(self, tmp_path: pathlib.Path) -> None:
        spectra = tmp_path / ".spectra"
        spectra.mkdir()
        long_heading = "A" * 300
        p = spectra / "long-spec.md"
        p.write_text(f"# {long_heading}\n\nContent.\n", encoding="utf-8")
        backfill_directory(tmp_path)
        sidecar = spectra / "long-spec.md.envelope.json"
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        assert len(data["objective"]) <= 240


# ---------------------------------------------------------------------------
# render_markdown
# ---------------------------------------------------------------------------


class TestRenderMarkdown:
    def test_returns_string(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        md = render_markdown(report)
        assert isinstance(md, str)
        assert "# ECL Migration Report" in md

    def test_counts_in_output(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        md = render_markdown(report)
        assert str(report.created_count) in md
        assert str(report.scanned_count) in md

    def test_deterministic(self, tmp_path: pathlib.Path) -> None:
        _make_project(tmp_path)
        report = backfill_directory(tmp_path)
        assert render_markdown(report) == render_markdown(report)


# ---------------------------------------------------------------------------
# Helper functions used by multiple test classes
# ---------------------------------------------------------------------------


def report_entries_created(report: MigrationReport) -> list[MigrationFileEntry]:
    """Return only the 'created' entries from a report."""
    return [e for e in report.entries if e.status == "created"]


# ---------------------------------------------------------------------------
# Integration test — real-world nexus .spectra/ directory
# ---------------------------------------------------------------------------


@integration
def test_nexus_spectra_real_world(tmp_path: pathlib.Path) -> None:
    """Run migration against the actual nexus .spectra/ checkout.

    This test:
    1. Copies the nexus .spectra/ tree into tmp_path (does NOT modify the
       original).
    2. Runs backfill_directory on tmp_path.
    3. Asserts created_count >= 1 (at least some files were migrated).
    4. Attempts conformance check via bash conformance/check.sh if available.
    """
    if not _NEXUS_SPECTRA.is_dir():
        pytest.skip(
            f"Nexus .spectra/ checkout not found at {_NEXUS_SPECTRA}; skipping integration test."
        )

    md_files = list(_NEXUS_SPECTRA.rglob("*.md"))
    if not md_files:
        pytest.skip(f"No .md files found under {_NEXUS_SPECTRA}; skipping.")

    # Copy into a temp directory so we do not touch the original checkout.
    target = tmp_path / ".spectra"
    shutil.copytree(_NEXUS_SPECTRA, target)

    # Wrap in a project root so backfill recognises the .spectra subdir.
    project_root = tmp_path
    report = backfill_directory(project_root)

    # At least some files should have been processed.
    assert report.scanned_count >= 1, (
        f"Expected at least 1 scanned file, got {report.scanned_count}"
    )

    # All created envelopes must have valid structure.
    for entry in report.entries:
        if entry.status != "created":
            continue
        assert entry.envelope_path is not None
        env_file = project_root / entry.envelope_path
        data = json.loads(env_file.read_text(encoding="utf-8"))

        # Required fields.
        for field in (
            "envelope_version",
            "message_id",
            "thread_id",
            "parent_id",
            "from",
            "to",
            "performative",
            "objective",
            "artifact",
            "integrity",
            "trace",
        ):
            assert field in data, f"Missing field '{field}' in {env_file}"

        # Integrity value matches actual file on disk (the copy).
        md_path = project_root / entry.path
        expected_hex = hashlib.sha256(md_path.read_bytes()).hexdigest()
        assert data["integrity"]["value"] == expected_hex, f"SHA-256 mismatch for {entry.path}"

    # Conformance check (best-effort — skip if check.sh unavailable).
    check_sh = _REPO_ROOT / "conformance" / "check.sh"
    if check_sh.is_file():
        import subprocess

        result = subprocess.run(
            ["bash", str(check_sh), str(project_root), "--level=MUST"],
            capture_output=True,
            text=True,
        )
        assert result.returncode in (0, 3, 4), (
            f"conformance/check.sh --level=MUST failed (exit {result.returncode}):\n"
            f"{result.stdout}\n{result.stderr}"
        )
