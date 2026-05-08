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

ECL v2.0 is targeted to add an **A2A bridge**: a small adapter that
emits an A2A Agent Card from the Eidolons roster and converts incoming
A2A `Message`s to ECL envelopes when an external agent wants to
collaborate with an Eidolon. This is scoped as an extension, not a
fork.
