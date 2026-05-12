"""Translate an inbound A2A Message to a conformant ECL v1.0 envelope.

The bridge is one-way: A2A Message → ECL envelope.  Reverse translation is
out of scope for this story (Phase 3 work).

A2A Message shape (per A2A spec):
    {
        "role": "user" | "agent",
        "parts": [{"kind": "text", "text": "..."}],
        "metadata": {...}   # optional
    }

Only ``kind: "text"`` parts are handled.  Other part kinds are ignored with
a comment emitted in ``assumptions``.

``artifact.path`` sentinel:
    The ECL envelope schema requires ``artifact.path`` to be a relative
    file path.  Inbound A2A messages carry inline content, not a file path.
    We use the sentinel ``"a2a-message.txt"`` as a relative path placeholder.
    Callers SHOULD persist the inline content to a file at that relative path
    (in whatever directory they write the envelope) before forwarding the
    envelope to a downstream receiver, so that the conformance checker can
    resolve the artifact.

    The inline content is available as ``envelope["x_inline_content"]``
    (a vendor extension field per ECL §1.2.3, which receivers SHALL ignore).

Story: S2.4 — Phase 2.B.
"""

from __future__ import annotations

import datetime
import hashlib
import uuid
from typing import Any

# ---------------------------------------------------------------------------
# Role → performative mapping (per S2.4 spec)
# ---------------------------------------------------------------------------

_ROLE_TO_PERFORMATIVE: dict[str, str] = {
    "user": "REQUEST",
    "agent": "PROPOSE",
}

# Sentinel relative path used when the artifact is inline content.
# Callers MUST persist the content to this filename (relative to the
# envelope file's directory) before running the conformance checker.
_INLINE_SENTINEL_PATH = "a2a-message.txt"

# ECL envelope version targeted by this SDK.
_ENVELOPE_VERSION = "1.0"

# Token approximation: one token ≈ 4 characters.
_CHARS_PER_TOKEN = 4

# Context budget token limit.
_TOKEN_BUDGET = 4000


def _extract_text(message: dict[str, object]) -> str:
    """Concatenate all ``kind: "text"`` part texts from the A2A message.

    Non-text parts are silently skipped (the caller gets an assumption entry
    noting the skip — see ``translate_a2a_message``).

    Returns the concatenated string (empty string if no text parts).
    """
    parts: Any = message.get("parts") or []
    chunks: list[str] = []
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, dict) and part.get("kind") == "text":
                text = part.get("text")
                if isinstance(text, str):
                    chunks.append(text)
    return "".join(chunks)


def _sha256_hex(content: str) -> str:
    """Return the lowercase hex SHA-256 of *content* encoded as UTF-8."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _now_iso8601() -> str:
    """Return the current UTC time as an ISO 8601 string (RFC 3339)."""
    return datetime.datetime.now(tz=datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def translate_a2a_message(
    message: dict[str, object],
    *,
    target_eidolon: str,
    target_version: str = "n/a",
) -> dict[str, object]:
    """Translate an inbound A2A Message to a conformant ECL v1.0 envelope.

    Parameters
    ----------
    message:
        Parsed A2A Message dict.  Expected fields:
        - ``role``: ``"user"`` | ``"agent"``
        - ``parts``: list of ``{"kind": "text", "text": "..."}``
        - ``metadata`` (optional): arbitrary dict of string values
    target_eidolon:
        Slug of the destination Eidolon (e.g. ``"atlas"``).
    target_version:
        Version string of the destination Eidolon.  Defaults to ``"n/a"``.

    Returns
    -------
    dict[str, object]
        ECL v1.0 envelope dict.  The ``x_inline_content`` vendor extension
        field carries the raw content string extracted from the message
        parts.  Callers SHOULD persist this to ``artifact.path`` (relative
        to the envelope's directory) before forwarding to a downstream
        receiver or running the conformance checker.

    Notes
    -----
    - ``artifact.path`` is set to the sentinel ``"a2a-message.txt"``.
      The conformance checker (``conformance/check.sh``) resolves this
      relative to the directory containing the ``.envelope.json`` file.
      Callers MUST write the inline content to that location.
    - ``integrity.value`` is the SHA-256 of the UTF-8 encoded inline
      content (NOT of the file on disk, since we do not write files here).
      When the caller persists the content without modification the digest
      will match.
    - Metadata fields are appended to ``assumptions[]`` for traceability.
    - Unknown A2A ``role`` values default to ``"REQUEST"`` with an
      assumption entry noting the fallback.
    """
    role = message.get("role", "user")
    if not isinstance(role, str):
        role = "user"

    performative = _ROLE_TO_PERFORMATIVE.get(role)
    assumptions: list[str] = [
        "Inbound A2A message translated to ECL envelope; "
        "artifact.path is a sentinel — callers SHOULD persist content to "
        "a2a-message.txt in the envelope directory before downstream emit.",
    ]

    if performative is None:
        performative = "REQUEST"
        assumptions.append(f"Unknown A2A role {role!r}; defaulted performative to REQUEST.")

    content = _extract_text(message)

    # Warn if non-text parts were present and skipped.
    parts: Any = message.get("parts") or []
    if isinstance(parts, list):
        for part in parts:
            if isinstance(part, dict) and part.get("kind") != "text":
                kind = part.get("kind", "<unknown>")
                assumptions.append(f"A2A part kind {kind!r} ignored; only 'text' is supported.")

    # Compute integrity digest over the inline content bytes.
    sha256 = _sha256_hex(content)
    content_bytes = content.encode("utf-8")
    size_bytes = len(content_bytes)

    # Approximate token usage (1 token ≈ 4 chars).
    tokens_used = max(1, size_bytes // _CHARS_PER_TOKEN)

    # Summary: first 200 chars of content, stripped.
    summary = content[:200].strip()

    # Incorporate A2A metadata into assumptions (sorted for determinism).
    metadata: Any = message.get("metadata")
    if isinstance(metadata, dict):
        for key in sorted(metadata.keys()):
            val = metadata[key]
            assumptions.append(f"a2a metadata: {key}={val!r}")

    # Objective: derive from summary or fall back to generic text.
    objective_text = summary[:240] if summary else "Inbound A2A message translated to ECL envelope."
    # Ensure maxLength=240 constraint
    objective_text = objective_text[:240]

    msg_id = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())

    envelope: dict[str, object] = {
        "artifact": {
            "kind": "a2a-message",
            "path": _INLINE_SENTINEL_PATH,
            "schema_version": "1.0",
            "sha256": sha256,
            "size_bytes": size_bytes,
        },
        "assumptions": assumptions,
        "confidence": 0.5,
        "constraints": {
            "trust_level": "low",  # external source default per ECL §6.3
        },
        "context_delta": {
            "input_handles": [],
            "summary": summary,
            "token_budget": _TOKEN_BUDGET,
            "tokens_used": tokens_used,
        },
        "edge_origin": "implicit",
        "envelope_version": _ENVELOPE_VERSION,
        "expected_response": {
            "performative": "ACKNOWLEDGE",
        },
        "from": {
            "eidolon": "a2a-external",
            "version": "n/a",
        },
        "integrity": {
            "method": "sha256",
            "value": sha256,
        },
        "message_id": msg_id,
        "objective": objective_text,
        "parent_id": None,
        "performative": performative,
        "thread_id": thread_id,
        "to": {
            "eidolon": target_eidolon,
            "version": target_version,
        },
        "trace": {
            "host": "a2a-bridge",
            "model": "unknown",
            "tier": "standard",
            "ts": _now_iso8601(),
        },
        # Vendor extension field (ECL §1.2.3): receivers SHALL ignore x_* fields.
        # Carries the inline content so callers can persist it to artifact.path.
        "x_inline_content": content,
    }

    return envelope
