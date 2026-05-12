"""ECL migration module — Story S2.2 (Phase 2.B).

Exports the public API for back-filling v1.0 envelopes on legacy artefacts.
"""

from .backfill import MigrationReport, backfill_directory

__all__ = ["backfill_directory", "MigrationReport"]
