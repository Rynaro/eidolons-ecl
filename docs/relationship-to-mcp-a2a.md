# Relationship to MCP, A2A, and ACP

ECL is not in competition with MCP (Anthropic's Model Context Protocol),
A2A (Google's Agent-to-Agent), or ACP (IBM/BeeAI's Agent Communication
Protocol). It is a **niche protocol** designed for one specific
audience: the Eidolons, a fixed set of methodology-bearing agents that
hand off artefacts via the filesystem. The other three are general-
purpose agent interop protocols.

This doc maps ECL fields to the closest analog in each.

## Comparison summary

| Dimension | MCP | A2A | ACP | ECL |
|---|---|---|---|---|
| Transport | JSON-RPC 2.0 over HTTP/stdio | JSON-RPC over HTTP | REST + SSE | filesystem (sidecar JSON) |
| Discovery | Tool manifest | Agent Cards (`/.well-known/agent-card.json`) | Registry | Hand-off contracts |
| Trust model | Per-server OAuth/keys | mTLS + task-level auth | Configurable | sha256 default; HMAC OPTIONAL |
| Streaming | tools/list paginates; resources subscribe | SSE on long tasks | SSE / push | N/A (artefact-on-disk) |
| Performatives | Implicit (request/notification) | Implicit (message vs task) | Implicit | Explicit (closed set of 10) |
| Multimodality | Content blocks (text/image/audio) | Parts (text/file/data) | MIME parts | Free; ECL doesn't constrain payload format |
| Audience | Agent ↔ Tool | Agent ↔ Agent (cross-vendor) | Agent ↔ Agent (multimodal) | Eidolon ↔ Eidolon (filesystem) |

## Field-level mapping

### Envelope identity

| ECL | MCP analog | A2A analog | ACP analog |
|---|---|---|---|
| `message_id` | JSON-RPC `id` | Message ID | Message UUID |
| `thread_id` | (none — stateless) | `contextId` | Thread ID |
| `parent_id` | (none) | Implicit via Task graph | (none) |
| `from`/`to` | (server is implicit) | `role` (`user` / `agent`) | `role` |

### Intent

| ECL | MCP analog | A2A analog | ACP analog |
|---|---|---|---|
| `performative` | `method` (e.g. `tools/call`) | (implicit) | (implicit) |
| `objective` | (none) | (none) | (none) |
| `expected_response` | (paired with `id`) | Task lifecycle hint | (none) |

### Payload

| ECL | MCP analog | A2A analog | ACP analog |
|---|---|---|---|
| `artifact.kind` | Tool name | Artifact `name` | Resource `kind` |
| `artifact.path` | Resource URI | Artifact bytes/URL | URL or inline part |
| `artifact.sha256` | (not present) | (not present) | (not present) |
| `context_delta` | (none) | (none) | (none) |

### Integrity

ECL is unusual in carrying a `sha256` integrity tag in the envelope.
MCP, A2A, and ACP all rely on transport-layer integrity (TLS) and do
not include payload-layer hashing. ECL's choice reflects the Eidolons'
disk-first artefact model and the AiTM threat model from ACL 2025.

## When to choose which

This is a *deliberate niche*. Most projects should use MCP and A2A:

- Use **MCP** when an LLM calls tools or fetches resources.
- Use **A2A** when one agent delegates a task to another agent across
  framework or vendor boundaries.
- Use **ACP** when agents exchange multimodal payloads with rich
  metadata (citations, trajectories) over REST.
- Use **ECL** when the agents in question are the Eidolons (or any
  fixed set of methodology-bearing agents that hand off via the
  filesystem) and you need:
  - Closed performative semantics
  - On-disk lineage (an envelope is a file you can grep)
  - Bash-only validation toolchain (no daemon, no SDK install)
  - Compliance with the existing Eidolons hand-off graph

## Future bridge

ECL v2.0 was originally targeted to add an A2A bridge. That work
landed early as a one-way reference adapter in **v1.2.1** — see the
section below for the shipped implementation. The v2.0 cut now
focuses on the S2.3 ISE-style trust hierarchy fields (Phase 2.C).

## v1.2.1 — A2A bridge reference implementation

Phase 2.B (v1.2.1) ships a one-way bridge from inbound A2A traffic
into the ECL envelope format. The bridge is intentionally inbound-
only — reverse translation (ECL → A2A) is Phase 3 work and is not
in scope for this release.

Module path: `reference-sdk/py/src/eidolons_ecl/a2a_bridge/`.

### `emit_agent_card(roster_path)`

Reads a roster YAML (canonically `roster/index.yaml` in the nexus
repo) and returns an A2A Agent Card dict suitable for serving at
`/.well-known/agent-card.json`. The top-level `schemaVersion` is
`"1.0"` (tracks the A2A spec); the aggregate `version` is `"1.2"`
(tracks the ECL SDK version, not the A2A schema). Each `members[]`
entry mirrors one roster `eidolons[*]` row and exposes `name`,
`description`, `capability_class`, `methodology_cycle`,
`lateral_consultants[]`, and a downstream-derived `skills[]` array.
The bridge has no HTTP listener; `endpoints[]` is always empty.

### `translate_a2a_message(msg, target_eidolon=..., target_version=...)`

Converts an inbound A2A Message dict (`role`, `parts[]`, optional
`metadata`) into a conformant ECL v1.0 envelope dict. Mapping rules:

- `role: "user"   → performative: "REQUEST"`
- `role: "agent"  → performative: "PROPOSE"`
- unknown role → `"REQUEST"` with an entry in `assumptions[]` noting
  the fallback.
- `from.eidolon = "a2a-external"`, `from.version = "n/a"`.
- `to.eidolon = <target_eidolon>`, `to.version = <target_version>`.
- `trust_level = "low"` (external source default per ECL §6.3).
- `edge_origin = "implicit"`.
- `artifact.kind = "a2a-message"`,
  `artifact.path = "a2a-message.txt"` (sentinel),
  `artifact.sha256` is the digest of the inline content bytes,
  `artifact.size_bytes` is the UTF-8 byte length.
- The raw inline text is carried as the vendor extension field
  `x_inline_content` (`x_*` per ECL §1.2.3 — receivers SHALL ignore).
- Non-`text` A2A part kinds are skipped with an explanatory entry
  appended to `assumptions[]`.
- Metadata fields are appended to `assumptions[]` (sorted for
  determinism) so they remain auditable without polluting the
  canonical envelope shape.

### Operator action required

The bridge does **not** auto-declare its inbound edge. For any
Eidolon that you expose externally, declare an
`a2a-external → <target>` contract in `contracts/` so the bash
conformance checker can resolve the C-2 edge gate. The repo's
canonical `contracts/` set intentionally omits these edges — they
are deployment-specific. The integration test in
`reference-sdk/py/tests/test_a2a_bridge.py` provisions a synthetic
`a2a-external-to-atlas.yaml` in a tmp dir to prove the round-trip
through `conformance/check.sh` works end-to-end.

### Persisting inline content

Because `artifact.path` is a sentinel, callers SHOULD write the
value of `x_inline_content` to `a2a-message.txt` (relative to the
directory containing the envelope file) before forwarding the
envelope to a downstream receiver. The conformance checker resolves
`artifact.path` relative to the envelope's directory; if the file
is absent, the integrity gate (`I-1`/`I-2`) will fail.

Sources: `reference-sdk/py/src/eidolons_ecl/a2a_bridge/agent_card.py`,
`reference-sdk/py/src/eidolons_ecl/a2a_bridge/translator.py`,
`reference-sdk/py/tests/test_a2a_bridge.py`, S2.4 spec session.

## v2.0.0 — ISE trust hierarchy

ECL v2.0 introduces the optional **ISE** (Intent, Source, Entitlement)
block at the envelope root, anchored in
[`spec/ecl-2.0.md` §6.5](../spec/ecl-2.0.md). ISE is sibling to the
existing `constraints.trust_level` field — it does **not** replace it.
Where `trust_level` answers "how cautious should the receiver be?",
ISE answers three sharper questions:

| Field | Question | Values / shape |
|---|---|---|
| `ise.assertion_grade` | **What does the emitter claim about how the artefact was produced?** | `unverified` \| `self-attested` \| `validated` \| `human-reviewed` |
| `ise.provenance` | **How was the artefact derived?** | `methodology_version` (required, e.g. `"spectra-4.3.1"`); optional `tool_surface[]` and `lateral_consults[]` |
| `ise.receiver_authorization` | **What is the receiver permitted to do with this envelope?** | `auto_route` / `auto_merge` / `auto_deploy` booleans (defaults: `true` / `false` / `false`) |

ISE is **OPT-IN on emit** at v2.0: envelopes without `ise` remain fully
conformant (see [§7.3](../spec/ecl-2.0.md) compatibility window — v2.0
receivers SHALL accept v1.x envelopes through 2027-05-13). When the block
is present, only `ise.assertion_grade` is required inside it; the other
sub-objects are optional. New conformance gates `S-1` (MUST — block
shape), `S-2` (MUST — receiver-authorization honoured), and `S-3`
(SHOULD WARN at v2.0 — `trust_level=high` without `ise`) cover the
three field surfaces.

### Operator guidance: A2A bridge envelopes and ISE

The A2A bridge described in the v1.2.1 section above is unchanged at
v2.0 — `a2a_bridge/translator.py` still emits **v1.0** envelopes
(DECISION-S4 in `.spectra/v2.0-phase2c.md`). The bridge's job is to
attach an ECL envelope to an artefact whose provenance the bridge
itself cannot vouch for; emitting a v2.0 envelope with a fabricated
`ise.assertion_grade` would defeat the trust-hierarchy story.

For operators who choose to **re-emit** bridged envelopes at v2.0
(for example, after manual operator review of the inbound A2A
content), the recommended pattern is to explicitly surface the trust
gap:

```json
{
  "envelope_version": "2.0",
  "from": { "eidolon": "a2a-external", "version": "n/a" },
  "constraints": { "trust_level": "low" },
  "ise": {
    "assertion_grade": "unverified",
    "provenance": {
      "methodology_version": "a2a-external-0.0.0",
      "tool_surface": ["a2a_bridge.translate_a2a_message"]
    },
    "receiver_authorization": {
      "auto_route": false,
      "auto_merge": false,
      "auto_deploy": false
    }
  }
}
```

This is **operator guidance, not a normative emitter contract** — the
shipped `a2a_bridge/translator.py` does not produce this shape; the
operator-side wrapper that re-emits the envelope at v2.0 does. The
`assertion_grade: "unverified"` plus all-false `receiver_authorization`
flags make the trust gap explicit to any v2.0 receiver, which can then
gate auto-route/merge/deploy on `S-2` rather than relying on the coarse
`trust_level=low` signal alone.

See [`docs/migration-v1-to-v2.md`](migration-v1-to-v2.md) for the full
v1.x → v2.0 upgrade path, the asymmetric §7.3 compatibility contract
(v2.0 SHALL accept v1.x; v1.x verifiers MAY reject v2.0), and the SDK
flag changes (`--ise` on bash, `ise?` option on TS, `IseBlock` TypedDict
on Py).
