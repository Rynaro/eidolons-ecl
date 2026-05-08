# Rationale — why ECL exists

## The problem

The Eidolons already had a working hand-off discipline before ECL existed:

- `methodology/composition.md` enumerated artefact-level contracts
  (From → To → Artifact → Schema → Contains).
- `methodology/cortex/handoff-graph.md` tracked the edge graph with
  origin labels (`roster | composition | implicit`).
- `roster/index.yaml` declared `handoffs.{upstream, downstream, lateral}`
  per Eidolon.
- Each Eidolon emitted artefacts as YAML-frontmatter + Markdown bodies,
  with evidence anchors and `[DECISION]/[GAP]/[DISPUTED]` markers.

The discipline was real and it worked. But it had concrete gaps:

| Gap | Symptom |
|---|---|
| No envelope wrapper | Artefacts had no uniform sidecar carrying source/target/causality/integrity. |
| No performative tags | Artefacts didn't declare intent — proposal, final, replan-trigger, escalation? |
| No integrity tags | No defence at the message layer against agent-in-the-middle / prompt-infection. |
| No `context_delta` discipline | Each Eidolon re-read upstream artefacts in full; no machine-parseable token budget. |
| No audit/trace | No single lineage record of which Eidolon@version consumed/emitted what, when, on which model tier. |
| No version negotiation | Per-edge compatibility was not enforced; drift only warned. |
| Disputed VIGIL edges | composition.md declared edges that the roster did not. |

These are not theoretical. They map directly to the empirical results from
contemporary multi-agent literature: AiTM attacks on inter-agent
messages (ACL 2025), prompt-infection self-replication
(arXiv:2410.07283), context-bloat as the dominant cause of cost and
latency in production LLM-MAS, and the OpenReview 2025 finding that
structured protocols outperform free-form coordination.

## What ECL is

ECL is the smallest formalisation that closes those gaps without
breaking what already works. It is:

- **Opt-in.** Eidolons that don't emit ECL envelopes remain conformant.
- **Wrapping, not replacing.** Existing artefact formats are untouched;
  ECL adds a sidecar.
- **On-disk, not in-context.** Honors the existing
  `methodology/composition.md` invariant that artefacts travel through
  the filesystem, not the context window.
- **Vendorable.** Standalone bash conformance checker, no nexus runtime
  dependency. Mirrors the pattern set by `eidolons-eiis`.

## What ECL is not

- Not a runtime framework. The host LLM (Claude Code, Cursor, Codex,
  opencode) remains the runtime.
- Not a replacement for any per-Eidolon schema. Per-Eidolon schemas
  remain in each Eidolon's own repo; ECL adds a profile that the
  per-Eidolon schema must be a strict subset of.
- Not mandatory cryptographic identity. HMAC is OPTIONAL in v1.0;
  DIDs/signatures defer to v2.0.

## Design principles

1. **Specification > implementation.** Every gate has a numbered §
   reference in `spec/ecl-1.0.md`. The bash SDK is a reference, not
   the contract.
2. **Conform with one binary.** A consumer with `bash`, `jq`, and
   `shasum` can validate any ECL artefact directory. No Python, Node,
   or Go runtime is required.
3. **Closed performative set.** Ten verbs, no extension hatch in v1.0.
   Adding the eleventh requires a SemVer bump. This is the explicit
   trade — losing extensibility for closing the
   semantic-ambiguity loop classical FIPA ACL never closed.
4. **Disk artefact = the work; envelope = the meta.** Receivers MAY
   process the artefact without reading the envelope, but conformance
   then cannot be verified. The envelope is mandatory because trust is
   mandatory.

## What ECL borrows from prior art

- **FIPA ACL** — the performative vocabulary, reduced from 22 to 10
  to fit LLM agents that lack formal modal-logic semantics.
- **MCP** — the JSON-RPC envelope shape and capability-discovery
  pattern motivated the `artifact` field and `expected_response`
  shape hint.
- **A2A** — Agent Cards and the Task lifecycle motivated
  contract-per-edge and `thread_id` semantics.
- **ACP (IBM/BeeAI)** — citation and trajectory metadata schemas
  motivated the evidence-anchor requirement and the trace event format.

See [`docs/relationship-to-mcp-a2a.md`](relationship-to-mcp-a2a.md) for
the field-level mapping.
