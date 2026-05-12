"""Hand-derived TypedDicts mirroring ECL v1.x JSON schemas.

Shapes are derived from:
  - schemas/envelope.v1.json
  - schemas/handoff-event.v1.json
  - schemas/performative.v1.json (enum values)
  - schemas/handoff-contract.v1.json

This file is intentionally kept in sync with the schemas manually for
ECL spec v1.2. Code generation is deferred to a future story; manual
derivation is cheap and reviewable at this spec version.
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

# ---------------------------------------------------------------------------
# Performative — ECL §2
# ---------------------------------------------------------------------------

#: The 10 valid ECL performatives (§2). Literal union matches the
#: performative.v1.json enum.
Performative = Literal[
    "REQUEST",
    "INFORM",
    "PROPOSE",
    "CRITIQUE",
    "DECIDE",
    "DELEGATE",
    "ACKNOWLEDGE",
    "ESCALATE",
    "RESUME",
    "REFUSE",
]

# ---------------------------------------------------------------------------
# Supporting literals
# ---------------------------------------------------------------------------

#: Where the (from, to) edge is declared. ECL §3.3.
EdgeOrigin = Literal["roster", "composition", "implicit"]

#: Envelope trust level. ECL §constraints.trust_level.
TrustLevel = Literal["low", "standard", "high"]

#: Routing tier. ECL §5.2.
Tier = Literal["standard", "trance"]

#: Integrity method. ECL §6.1.
IntegrityMethod = Literal["sha256", "hmac-sha256"]

# ---------------------------------------------------------------------------
# Agent reference — envelope.v1.json $defs/agentRef
# ---------------------------------------------------------------------------


class AgentRef(TypedDict):
    """Reference to an Eidolon by slug and version. Used in envelope from/to.

    Reserved slugs: "human", "orchestrator" (version = "n/a").
    """

    #: Lowercase slug (^[a-z][a-z0-9-]*$).
    eidolon: str
    #: SemVer string or the literal "n/a" for human/orchestrator.
    version: str


# ---------------------------------------------------------------------------
# Envelope sub-objects
# ---------------------------------------------------------------------------


class ArtifactBlock(TypedDict):
    """``artifact`` block — envelope.v1.json properties.artifact."""

    #: Kind slug (^[a-z][a-z0-9-]*$).
    kind: str
    #: SemVer of the per-Eidolon profile schema.
    schema_version: str
    #: Relative path to the payload (no leading slash, no "..").
    path: str
    #: Lowercase hex SHA-256 digest of the payload bytes.
    sha256: str
    #: Payload byte count at emit time.
    size_bytes: int


class ContextDelta(TypedDict):
    """``context_delta`` block — context-delta.v1.json."""

    tokens_used: int
    token_budget_max: int
    #: Optional summary added to the thread.
    summary: NotRequired[str]


class ConstraintsBlock(TypedDict):
    """``constraints`` block — envelope.v1.json properties.constraints."""

    #: RFC 3339 deadline, or null for no deadline.
    deadline_ts: NotRequired[str | None]
    trust_level: NotRequired[TrustLevel]


class ExpectedResponseBlock(TypedDict):
    """``expected_response`` block."""

    performative: NotRequired[Performative]
    shape_hint: NotRequired[str]


class IntegrityBlock(TypedDict):
    """``integrity`` block — ECL §6."""

    method: IntegrityMethod
    #: Lowercase hex SHA-256 (or HMAC-SHA-256) digest.
    value: str


class TraceBlock(TypedDict):
    """``trace`` block — envelope.v1.json properties.trace."""

    #: RFC 3339 UTC timestamp at envelope construction.
    ts: str
    #: Host environment slug (e.g. "claude-code", "cursor", "raw").
    host: str
    #: Model identifier (e.g. "claude-sonnet-4-6").
    model: str
    tier: Tier


# ---------------------------------------------------------------------------
# Envelope — envelope.v1.json (top-level)
# ---------------------------------------------------------------------------


class Envelope(TypedDict):
    """Full ECL envelope v1. Required fields match ``required`` in the schema.

    Optional fields use ``NotRequired``. Vendor extension fields (x_*) are
    permitted by the schema (patternProperties) but are not typed here;
    consumers can use ``cast`` or direct dict access if needed.
    """

    #: ECL spec version (^1\\.0(\\.\\d+)?$).
    envelope_version: str
    #: Globally unique message ID. UUIDv7 RECOMMENDED.
    message_id: str
    #: UUID grouping all envelopes of one logical mission.
    thread_id: str
    #: Causal predecessor message_id, or null on first envelope.
    parent_id: str | None
    from_: NotRequired[AgentRef]  # key stored as "from" in JSON
    to: AgentRef
    performative: Performative
    #: Where the (from, to) edge is declared.
    edge_origin: NotRequired[EdgeOrigin]
    #: Goal of this message (1–240 chars).
    objective: str
    artifact: ArtifactBlock
    context_delta: NotRequired[ContextDelta]
    constraints: NotRequired[ConstraintsBlock]
    expected_response: NotRequired[ExpectedResponseBlock]
    #: Sender self-assessed confidence [0, 1].
    confidence: NotRequired[float]
    #: Material assumptions the receiver should know.
    assumptions: NotRequired[list[str]]
    integrity: IntegrityBlock
    trace: TraceBlock


# ---------------------------------------------------------------------------
# Contract — handoff-contract.v1.json
# ---------------------------------------------------------------------------


class _ArtifactEntry(TypedDict):
    kind: str
    schema_version: str


class _ContextDeltaConstraint(TypedDict):
    token_budget_max: int


class Contract(TypedDict):
    """Handoff contract loaded from ``contracts/<from>-to-<to>.yaml``.

    Only the fields consumed by the SDK are typed here; the full schema
    lives at schemas/handoff-contract.v1.json.
    """

    contract_version: str
    from_: NotRequired[str]  # key stored as "from" in YAML
    to: str
    trust_level: NotRequired[TrustLevel]
    allowed_performatives: list[Performative]
    artifacts: list[_ArtifactEntry]
    context_delta: NotRequired[_ContextDeltaConstraint]


# ---------------------------------------------------------------------------
# Trace event — handoff-event.v1.json
# ---------------------------------------------------------------------------

TraceEventKind = Literal["emit", "receive", "verify_pass", "verify_fail"]

VerifyFailureCode = Literal[
    "INTEGRITY_MISMATCH",
    "SCHEMA_INVALID",
    "UNDECLARED_EDGE",
    "PERFORMATIVE_NOT_ALLOWED",
    "ARTIFACT_KIND_NOT_ALLOWED",
    "CONTEXT_OVER_BUDGET",
    "MISSING_REQUIRED_SECTION",
]


class _TraceEventBase(TypedDict):
    """Base fields shared by all trace event kinds."""

    #: RFC 3339 UTC timestamp.
    ts: str
    #: Globally unique message ID this event refers to.
    message_id: str
    #: Thread the message belongs to.
    thread_id: str
    #: "<eidolon>@<version>" slug.
    from_: str  # key stored as "from" in JSONL
    #: "<eidolon>@<version>" slug.
    to: str
    performative: Performative
    integrity_method: IntegrityMethod
    context_tokens: NotRequired[int]
    model: NotRequired[str]
    tier: NotRequired[Tier]


class EmitTraceEvent(_TraceEventBase):
    """Envelope was emitted by the sender."""

    event: Literal["emit"]


class ReceiveTraceEvent(_TraceEventBase):
    """Envelope was received by the target."""

    event: Literal["receive"]


class VerifyPassTraceEvent(_TraceEventBase):
    """Envelope passed verification."""

    event: Literal["verify_pass"]


class VerifyFailTraceEvent(_TraceEventBase):
    """Envelope failed verification. ECL §5.3 requires ``verify_failure_code``."""

    event: Literal["verify_fail"]
    verify_failure_code: VerifyFailureCode


#: Discriminated union of all trace event kinds. Branch on ``event`` to narrow.
TraceEvent = EmitTraceEvent | ReceiveTraceEvent | VerifyPassTraceEvent | VerifyFailTraceEvent
