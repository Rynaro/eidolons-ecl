"""Hand-derived TypedDicts mirroring ECL v2.0 JSON schemas.

Shapes are derived from:
  - schemas/envelope.v2.json (adds ISE block, ECL v2.0 §6.5)
  - schemas/envelope.v1.json (retained for v1.x compat, §7.3)
  - schemas/handoff-event.v1.json
  - schemas/performative.v1.json (enum values)
  - schemas/handoff-contract.v1.json

This file is intentionally kept in sync with the schemas manually for
ECL spec v2.0. Code generation is deferred to a future story; manual
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

#: Where the (from, to) edge is declared. ECL §3.3. `emitted-request` added
#: v2.2 — a typed request artifact PROPOSEd upward by the sender for the
#: orchestrator to route (distinguishes worker-emitted delegation from
#: roster-declared dispatch; the sender's roster entry keeps `downstream: []`).
EdgeOrigin = Literal["roster", "composition", "implicit", "emitted-request"]

#: Envelope trust level. ECL §constraints.trust_level.
TrustLevel = Literal["low", "standard", "high"]

#: Routing tier. ECL §5.2.
Tier = Literal["standard", "trance"]

#: Integrity method. ECL §6.1.
IntegrityMethod = Literal["sha256", "hmac-sha256"]

# ---------------------------------------------------------------------------
# ISE trust-hierarchy — envelope.v2.json $defs/ise (ECL v2.0 §6.5)
# ---------------------------------------------------------------------------

#: Emitter's claim about how the artefact was produced. ECL v2.0 §6.5.2.
AssertionGrade = Literal["unverified", "self-attested", "validated", "human-reviewed"]


class _LateralConsult(TypedDict):
    eidolon: str
    performative: str


class IseProvenance(TypedDict):
    """``ise.provenance`` — how the artefact was derived. ECL v2.0 §6.5.3."""

    #: Eidolon methodology + semver, e.g. "spectra-4.3.1".
    methodology_version: str
    #: Distinct tool primitives invoked (<=32 items).
    tool_surface: NotRequired[list[str]]
    #: Sibling-Eidolon consults (<=8 items).
    lateral_consults: NotRequired[list[_LateralConsult]]


class IseReceiverAuthorization(TypedDict):
    """``ise.receiver_authorization`` — what the receiver may do. ECL v2.0 §6.5.4."""

    #: Receiver MAY hand off to next contracted edge without operator confirm. Default true.
    auto_route: NotRequired[bool]
    #: Receiver MAY merge into mainline without operator confirm. Default false.
    auto_merge: NotRequired[bool]
    #: Receiver MAY deploy/publish without operator confirm. Default false.
    auto_deploy: NotRequired[bool]


class IseBlock(TypedDict):
    """ISE trust-hierarchy block. Optional at v2.0. ECL v2.0 §6.5.

    When present, ``assertion_grade`` is required.
    """

    assertion_grade: AssertionGrade
    provenance: NotRequired[IseProvenance]
    receiver_authorization: NotRequired[IseReceiverAuthorization]


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
    """Full ECL envelope v2. Required fields match ``required`` in the schema.

    Optional fields use ``NotRequired``. Vendor extension fields (x_*) are
    permitted by the schema (patternProperties) but are not typed here;
    consumers can use ``cast`` or direct dict access if needed.

    v1.x envelopes (without ``ise``) remain valid under the v2.0 §7.3
    compatibility window (through 2027-05-13).
    """

    #: ECL spec version (^(1\\.[012]|2\\.0)(\\.\\d+)?$).
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
    #: ISE trust-hierarchy block. Optional at v2.0. ECL v2.0 §6.5.
    ise: NotRequired[IseBlock]
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
