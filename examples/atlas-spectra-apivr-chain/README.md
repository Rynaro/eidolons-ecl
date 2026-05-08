# Example — ATLAS → SPECTRA → APIVR-Δ chain

A worked example of the canonical pipeline: a scout report flows from
ATLAS to SPECTRA, becomes a spec for APIVR-Δ to implement, and the
completion report flows on to IDG.

## Files

- `mission.md` — the original prompt
- `scout-report.md` — ATLAS output (frontmatter conforms to `scout-report.v1.json`)
- `spec.md` — SPECTRA output (frontmatter conforms to `spec.v1.json`)
- `apivr-completion-report.md` — APIVR-Δ output (frontmatter conforms to `apivr-completion-report.v1.json`)
- `run.sh` — generates envelopes + trace events; validates the chain

## Run it

```bash
bash run.sh
```

Expected output:

- Three `*.envelope.json` sidecar files written in this directory.
- One JSONL trace file at `.eidolons/.trace/<thread_id>.jsonl` with
  three `emit` events.
- `conformance/check.sh` reports all MUST gates pass; exit 0.
- The trace summary at the end shows the chain ATLAS → SPECTRA → APIVR-Δ
  with three `PROPOSE` envelopes threaded through one shared `thread_id`.

## What this example demonstrates

- **Single thread, three messages.** All three envelopes share one
  `thread_id`; each subsequent envelope sets `parent_id` to the
  previous `message_id`, building the causal chain.
- **Context-delta discipline.** Each summary is two sentences. No
  envelope re-states what was in the upstream artefact; receivers
  re-read the artefact via `input_handles` if they need detail.
- **Performative consistency.** All three are `PROPOSE` — each sender
  is offering a deliverable for the next stage to act on. None are
  `INFORM` (which would mean "no action needed") or `DELEGATE` (which
  would be the cortex assigning ownership).
- **Integrity verification.** Each envelope's `integrity.value` is a
  fresh SHA-256 of the artefact bytes; the conformance checker
  recomputes and verifies all three.
- **Edge origin.** Every edge is `roster` because all three appear in
  `roster/index.yaml`'s `handoffs.downstream` arrays.
