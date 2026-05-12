"""Tests for the A2A bridge — Story S2.4.

Covers:
- emit_agent_card: synthetic roster round-trip, determinism, missing file,
  and integration test against the live nexus roster.
- translate_a2a_message: user/agent roles, single/multiple parts, metadata,
  sha256 integrity, and (integration) bash conformance/check.sh.

Conformance round-trip design:
    The conformance checker resolves ``artifact.path`` relative to the
    directory containing the ``.envelope.json`` file.  For the round-trip
    test we write the inline content to ``<tmp_path>/a2a-message.txt``
    (matching the sentinel path in translator.py) and the envelope to
    ``<tmp_path>/test.envelope.json``, then invoke check.sh.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess

import pytest

from eidolons_ecl.a2a_bridge import emit_agent_card, translate_a2a_message

# ---------------------------------------------------------------------------
# Markers
# ---------------------------------------------------------------------------

integration = pytest.mark.integration

# Paths used in integration tests.
_NEXUS_ROSTER = pathlib.Path("/Users/henrique/workspace/oss/agents/eidolons/roster/index.yaml")
_REPO_ROOT = pathlib.Path(__file__).parent.parent.parent.parent
_CONFORMANCE_CHECK = _REPO_ROOT / "conformance" / "check.sh"

# Path to the golden fixture (hand-authored against a synthetic 2-member roster).
_FIXTURES = pathlib.Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Synthetic roster helper
# ---------------------------------------------------------------------------


def _write_synthetic_roster(tmp_path: pathlib.Path) -> pathlib.Path:
    """Write a minimal 2-member roster YAML and return its path."""
    roster_yaml = """\
registry_version: "1.0"
eidolons:
  - name: atlas
    display_name: ATLAS
    capability_class: scout
    methodology:
      name: ATLAS
      version: "1.0"
      cycle: "A→T→L→A→S"
      summary: "Read-only codebase intelligence."
    versions:
      latest: "1.5.0"
    handoffs:
      downstream: [spectra]
      lateral: [forge]
  - name: spectra
    display_name: SPECTRA
    capability_class: planner
    methodology:
      name: SPECTRA
      version: "4.2"
      cycle: "S→P→E→C→T→R→A"
      summary: "Decision-ready specifications."
    versions:
      latest: "4.3.0"
    handoffs:
      downstream: [apivr]
      lateral: [forge]
"""
    roster_path = tmp_path / "roster.yaml"
    roster_path.write_text(roster_yaml, encoding="utf-8")
    return roster_path


# ===========================================================================
# emit_agent_card tests
# ===========================================================================


class TestEmitAgentCard:
    def test_synthetic_roster_lists_both_members(self, tmp_path: pathlib.Path) -> None:
        """Synthetic 2-member roster produces a card with both members."""
        roster_path = _write_synthetic_roster(tmp_path)
        card = emit_agent_card(roster_path)

        assert card["schemaVersion"] == "1.0"
        assert card["name"] == "eidolons-aggregate"
        assert card["organization"] == "eidolons"
        assert card["version"] == "1.2"
        assert isinstance(card["members"], list)
        members = card["members"]
        assert len(members) == 2

        atlas = next(m for m in members if m["name"] == "atlas")
        assert atlas["version"] == "1.5.0"
        assert atlas["methodology_cycle"] == "A→T→L→A→S"
        assert atlas["capability_class"] == "scout"
        # Skills: downstream = [spectra]
        assert len(atlas["skills"]) == 1
        assert atlas["skills"][0]["name"] == "spectra"
        assert "spectra" in atlas["skills"][0]["description"]
        # Lateral consultants
        assert "forge" in atlas["lateral_consultants"]

        spectra = next(m for m in members if m["name"] == "spectra")
        assert spectra["version"] == "4.3.0"
        assert len(spectra["skills"]) == 1
        assert spectra["skills"][0]["name"] == "apivr"

    def test_description_contains_display_name_and_summary(
        self, tmp_path: pathlib.Path
    ) -> None:
        roster_path = _write_synthetic_roster(tmp_path)
        card = emit_agent_card(roster_path)
        members = card["members"]
        atlas = next(m for m in members if m["name"] == "atlas")
        desc = atlas["description"]
        assert "ATLAS" in desc
        assert "Read-only codebase intelligence" in desc

    def test_determinism_byte_identical(self, tmp_path: pathlib.Path) -> None:
        """Rendering the card twice with sort_keys=True produces identical output."""
        roster_path = _write_synthetic_roster(tmp_path)
        card1 = emit_agent_card(roster_path)
        card2 = emit_agent_card(roster_path)
        rendered1 = json.dumps(card1, sort_keys=True, indent=2)
        rendered2 = json.dumps(card2, sort_keys=True, indent=2)
        assert rendered1 == rendered2

    def test_missing_roster_returns_error_via_cli(
        self, tmp_path: pathlib.Path
    ) -> None:
        """CLI: non-existent roster file → exit code 1, no crash."""
        import sys

        from eidolons_ecl.__main__ import cmd_a2a_card

        import types

        ns = types.SimpleNamespace(
            roster=str(tmp_path / "nonexistent.yaml"),
            out=None,
        )
        result = cmd_a2a_card(ns)
        assert result == 1

    def test_golden_file_matches_synthetic_roster(self, tmp_path: pathlib.Path) -> None:
        """Card output against synthetic 2-member roster matches the golden file."""
        roster_path = _write_synthetic_roster(tmp_path)
        card = emit_agent_card(roster_path)
        rendered = json.dumps(card, sort_keys=True, indent=2)
        expected_path = _FIXTURES / "agent-card.expected.json"
        expected = json.loads(expected_path.read_text(encoding="utf-8"))
        # Compare as dicts (not string) so key order doesn't matter.
        assert card == expected, (
            f"Card does not match golden file.\nGot:\n{rendered}\n"
            f"Expected:\n{json.dumps(expected, sort_keys=True, indent=2)}"
        )

    @integration
    def test_integration_live_roster(self) -> None:
        """Integration: emit_agent_card against the actual nexus roster."""
        if not _NEXUS_ROSTER.is_file():
            pytest.skip(f"nexus roster not found at {_NEXUS_ROSTER}")

        card = emit_agent_card(_NEXUS_ROSTER)

        assert card["schemaVersion"] == "1.0"
        assert isinstance(card["members"], list)
        assert len(card["members"]) >= 6  # atlas, spectra, apivr, idg, forge, vigil

        names = {m["name"] for m in card["members"]}
        for expected_name in ("atlas", "spectra", "apivr", "idg", "forge", "vigil"):
            assert expected_name in names, f"{expected_name!r} missing from card members"


# ===========================================================================
# translate_a2a_message tests
# ===========================================================================


def _sha256_of(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class TestTranslateA2aMessage:
    def _user_message(self, text: str = "Hello world.") -> dict[str, object]:
        return {
            "role": "user",
            "parts": [{"kind": "text", "text": text}],
        }

    def _agent_message(self, text: str = "Here is my proposal.") -> dict[str, object]:
        return {
            "role": "agent",
            "parts": [{"kind": "text", "text": text}],
        }

    def test_user_role_maps_to_request(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        assert envelope["performative"] == "REQUEST"

    def test_agent_role_maps_to_propose(self) -> None:
        envelope = translate_a2a_message(self._agent_message(), target_eidolon="atlas")
        assert envelope["performative"] == "PROPOSE"

    def test_from_is_a2a_external(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="spectra")
        from_field = envelope["from"]
        assert isinstance(from_field, dict)
        assert from_field["eidolon"] == "a2a-external"
        assert from_field["version"] == "n/a"

    def test_to_is_target_eidolon(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        to_field = envelope["to"]
        assert isinstance(to_field, dict)
        assert to_field["eidolon"] == "atlas"

    def test_integrity_method_is_sha256(self) -> None:
        envelope = translate_a2a_message(self._user_message("test content"), target_eidolon="atlas")
        integrity = envelope["integrity"]
        assert isinstance(integrity, dict)
        assert integrity["method"] == "sha256"

    def test_integrity_value_matches_content_sha256(self) -> None:
        text = "Please review this code change for ATLAS scout-report quality."
        envelope = translate_a2a_message(
            {"role": "user", "parts": [{"kind": "text", "text": text}]},
            target_eidolon="atlas",
        )
        integrity = envelope["integrity"]
        assert isinstance(integrity, dict)
        expected_hash = _sha256_of(text)
        assert integrity["value"] == expected_hash

    def test_multiple_parts_concatenated(self) -> None:
        msg: dict[str, object] = {
            "role": "user",
            "parts": [
                {"kind": "text", "text": "Part one. "},
                {"kind": "text", "text": "Part two."},
            ],
        }
        envelope = translate_a2a_message(msg, target_eidolon="apivr")
        content = "Part one. Part two."
        expected_hash = _sha256_of(content)
        integrity = envelope["integrity"]
        assert isinstance(integrity, dict)
        assert integrity["value"] == expected_hash
        # size_bytes should match UTF-8 bytes of concatenation
        artifact = envelope["artifact"]
        assert isinstance(artifact, dict)
        assert artifact["size_bytes"] == len(content.encode("utf-8"))

    def test_metadata_appears_in_assumptions(self) -> None:
        msg: dict[str, object] = {
            "role": "user",
            "parts": [{"kind": "text", "text": "Hello."}],
            "metadata": {
                "source": "external-reviewer",
                "session_id": "abc-123",
            },
        }
        envelope = translate_a2a_message(msg, target_eidolon="atlas")
        assumptions = envelope["assumptions"]
        assert isinstance(assumptions, list)
        assumption_text = "\n".join(str(a) for a in assumptions)
        assert "session_id" in assumption_text
        assert "source" in assumption_text

    def test_trust_level_is_low(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        constraints = envelope["constraints"]
        assert isinstance(constraints, dict)
        assert constraints["trust_level"] == "low"

    def test_artifact_path_is_sentinel(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        artifact = envelope["artifact"]
        assert isinstance(artifact, dict)
        assert artifact["path"] == "a2a-message.txt"
        assert artifact["kind"] == "a2a-message"

    def test_envelope_version_is_1_0(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        assert envelope["envelope_version"] == "1.0"

    def test_expected_response_is_acknowledge(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        expected_response = envelope["expected_response"]
        assert isinstance(expected_response, dict)
        assert expected_response["performative"] == "ACKNOWLEDGE"

    def test_trace_fields_populated(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        trace = envelope["trace"]
        assert isinstance(trace, dict)
        assert trace["host"] == "a2a-bridge"
        assert trace["model"] == "unknown"
        assert trace["tier"] == "standard"
        assert "ts" in trace

    def test_message_id_and_thread_id_are_uuids(self) -> None:
        import uuid

        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        # Should not raise if valid UUIDs.
        uuid.UUID(str(envelope["message_id"]))
        uuid.UUID(str(envelope["thread_id"]))

    def test_parent_id_is_null(self) -> None:
        envelope = translate_a2a_message(self._user_message(), target_eidolon="atlas")
        assert envelope["parent_id"] is None

    def test_x_inline_content_carries_text(self) -> None:
        text = "Inline content for testing."
        envelope = translate_a2a_message(
            {"role": "user", "parts": [{"kind": "text", "text": text}]},
            target_eidolon="atlas",
        )
        assert envelope["x_inline_content"] == text

    def test_metadata_entries_sorted_by_key(self) -> None:
        """Metadata assumptions appear in sorted key order."""
        msg: dict[str, object] = {
            "role": "user",
            "parts": [{"kind": "text", "text": "x"}],
            "metadata": {
                "z_key": "z_val",
                "a_key": "a_val",
            },
        }
        envelope = translate_a2a_message(msg, target_eidolon="atlas")
        assumptions = envelope["assumptions"]
        assert isinstance(assumptions, list)
        meta_entries = [a for a in assumptions if str(a).startswith("a2a metadata:")]
        # First should be a_key (alphabetically before z_key).
        assert meta_entries[0].startswith("a2a metadata: a_key")
        assert meta_entries[1].startswith("a2a metadata: z_key")

    def test_fixture_sample_message_produces_request(self) -> None:
        """The fixture a2a-message-sample.json translates to a REQUEST envelope."""
        sample_path = _FIXTURES / "a2a-message-sample.json"
        msg = json.loads(sample_path.read_text(encoding="utf-8"))
        envelope = translate_a2a_message(msg, target_eidolon="atlas")
        assert envelope["performative"] == "REQUEST"
        integrity = envelope["integrity"]
        assert isinstance(integrity, dict)
        expected_hash = _sha256_of(
            "Please review this code change for ATLAS scout-report quality."
        )
        assert integrity["value"] == expected_hash

    @integration
    def test_integration_conformance_round_trip(self, tmp_path: pathlib.Path) -> None:
        """Integration: translate → write files → bash conformance/check.sh → exit 0.

        The conformance checker resolves artifact.path relative to the envelope
        directory.  We write:
          - <tmp_path>/a2a-message.txt   — inline content (the artifact)
          - <tmp_path>/test.envelope.json — the ECL envelope

        Then run bash conformance/check.sh <envelope_path> and assert exit 0.
        """
        if not _CONFORMANCE_CHECK.is_file():
            pytest.skip(f"conformance/check.sh not found at {_CONFORMANCE_CHECK}")

        text = "Please review this code change for ATLAS scout-report quality."
        msg: dict[str, object] = {
            "role": "user",
            "parts": [{"kind": "text", "text": text}],
        }
        envelope = translate_a2a_message(msg, target_eidolon="atlas")

        # Write the inline content to the sentinel path.
        artifact_file = tmp_path / "a2a-message.txt"
        artifact_file.write_text(str(envelope["x_inline_content"]), encoding="utf-8")

        # Patch size_bytes to match the actual file (written without trailing newline).
        actual_size = artifact_file.stat().st_size
        artifact = dict(envelope["artifact"])  # type: ignore[arg-type]
        artifact["size_bytes"] = actual_size
        envelope = dict(envelope)
        envelope["artifact"] = artifact

        # Recompute sha256 over the actual file bytes (should match since no transformation).
        actual_sha256 = hashlib.sha256(artifact_file.read_bytes()).hexdigest()
        integrity = dict(envelope["integrity"])  # type: ignore[arg-type]
        integrity["value"] = actual_sha256
        envelope["integrity"] = integrity
        # Also update artifact.sha256 to match.
        artifact["sha256"] = actual_sha256
        envelope["artifact"] = artifact

        # Write the envelope sidecar.
        envelope_file = tmp_path / "test.envelope.json"
        envelope_file.write_text(
            json.dumps(envelope, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            ["bash", str(_CONFORMANCE_CHECK), str(envelope_file), "--level=MUST"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, (
            f"conformance/check.sh exited {result.returncode}.\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
