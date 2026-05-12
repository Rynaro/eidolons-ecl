"""A2A bridge — read-only adapter for the Eidolons system.

Provides two public functions:

- ``emit_agent_card`` — produce an A2A-compatible Agent Card from the
  Eidolons roster YAML (``roster/index.yaml`` in the nexus repo, or any
  roster-shaped YAML at the supplied path).

- ``translate_a2a_message`` — convert an inbound A2A ``Message`` object
  (dict) into a conformant ECL v1.0 envelope dict.  The bridge is one-way
  (A2A → ECL).  Reverse translation is out of scope for v1.2.

Story: S2.4 — Phase 2.B.
"""

from .agent_card import emit_agent_card
from .translator import translate_a2a_message

__all__ = ["emit_agent_card", "translate_a2a_message"]
