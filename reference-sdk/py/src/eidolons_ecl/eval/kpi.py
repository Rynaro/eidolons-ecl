"""KPI computation for ECL thread evaluation — Story S2.1.

Reads ``.eidolons/.trace/*.jsonl`` trace files and computes four KPI
families per thread:

1. **Coordination quality** — decision/refuse/escalate ratios.
2. **Topology efficacy** — chain | star | graph | degenerate.
3. **Competition resilience** — CRITIQUE performative fraction.
4. **Planning vs execution divergence** — SPECTRA PROPOSE to APIVR ESCALATE ratio.

All functions are deterministic and pure (no side-effects beyond file reads).
Dict outputs are sorted by key; iteration order is deterministic throughout.
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Literal

# ---------------------------------------------------------------------------
# KPI dataclasses
# ---------------------------------------------------------------------------

TopologyClass = Literal["chain", "star", "graph", "degenerate"]


@dataclass(frozen=True)
class CoordinationKpis:
    """Coordination quality KPIs.

    Verdict heuristic (documented here, mirrored in tests):
    - ``good``  — escalate_rate < 0.10 AND refuse_rate < 0.05
    - ``poor``  — escalate_rate > 0.30 OR  refuse_rate > 0.20
    - ``warn``  — everything else
    """

    decisions_per_envelope_ratio: float
    refuse_rate: float
    escalate_rate: float
    verdict: Literal["good", "warn", "poor"]


@dataclass(frozen=True)
class TopologyKpis:
    """Topology efficacy KPIs.

    Classification algorithm (from→to directed graph of ``emit`` events):

    - ``degenerate`` — a cycle exists (A→B→A or longer).
    - ``star``       — one node has in-degree ≥ 3 from ≥ 3 *distinct* senders.
    - ``chain``      — every node has in-degree ≤ 1 AND out-degree ≤ 1
                       (strictly linear path, including single-node threads).
    - ``graph``      — DAG with branches / multiple roots / fan-out but no
                       cycles and no dominant star hub.

    ``hub_eidolon`` is set to the slug (no ``@version``) of the star hub
    when topology is ``"star"``; otherwise ``None``.
    """

    topology: TopologyClass
    hub_eidolon: str | None
    branch_count: int
    cycle_detected: bool


@dataclass(frozen=True)
class CompetitionKpis:
    """Competition resilience KPIs.

    CRITIQUE fraction thresholds:
    - ``low``      — fraction < 0.10
    - ``moderate`` — 0.10 ≤ fraction ≤ 0.30
    - ``strong``   — fraction > 0.30
    """

    critique_count: int
    total_envelopes: int
    critique_fraction: float
    verdict: Literal["low", "moderate", "strong"]


@dataclass(frozen=True)
class PlanExecKpis:
    """Planning vs execution divergence KPIs.

    ``spectra_propose_count`` — number of ``emit`` events where
    ``from`` starts with ``spectra@`` (SPECTRA proposing work).

    ``apivr_escalate_count`` — number of ``emit`` events where
    ``from`` starts with ``apivr@`` AND ``performative == "ESCALATE"``.

    ``ratio`` — ``apivr_escalate_count / spectra_propose_count``.
    ``None`` when no SPECTRA proposes in thread.

    Verdict:
    - ``n/a``       — spectra_propose_count == 0
    - ``aligned``   — ratio < 0.50
    - ``divergent`` — ratio ≥ 0.50
    """

    spectra_propose_count: int
    apivr_escalate_count: int
    ratio: float | None  # None if spectra_propose_count == 0
    verdict: Literal["aligned", "divergent", "n/a"]


@dataclass(frozen=True)
class KpiReport:
    """Full KPI report for a single ECL thread."""

    thread_id: str
    envelope_count: int
    eidolons: list[str]  # sorted unique slugs (no @version)
    coordination: CoordinationKpis
    topology: TopologyKpis
    competition: CompetitionKpis
    plan_exec: PlanExecKpis


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _read_events(jsonl_path: pathlib.Path) -> list[dict[str, object]]:
    """Read and parse a JSONL trace file.

    Malformed lines are silently skipped (mirrors TS traceTail behaviour).
    Returns a list of parsed event dicts.
    """
    events: list[dict[str, object]] = []
    try:
        text = jsonl_path.read_text(encoding="utf-8")
    except OSError:
        return events
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            obj = json.loads(stripped)
        except json.JSONDecodeError:
            # Malformed line — skip silently.
            continue
        if isinstance(obj, dict):
            events.append(obj)
    return events


def _slug(agent_ref: object) -> str:
    """Extract the eidolon slug from a ``<slug>@<version>`` string."""
    if not isinstance(agent_ref, str):
        return ""
    at = agent_ref.find("@")
    return agent_ref[:at] if at != -1 else agent_ref


def _coordination(events: list[dict[str, object]]) -> CoordinationKpis:
    """Compute coordination quality KPIs.

    Only ``emit`` events are counted as envelope boundaries; receive/verify
    events are metadata duplicates of the same logical message.

    Verdict heuristic (see CoordinationKpis docstring):
    - ``good``  — escalate_rate < 0.10 AND refuse_rate < 0.05
    - ``poor``  — escalate_rate > 0.30 OR  refuse_rate > 0.20
    - ``warn``  — everything else
    """
    emit_events = [e for e in events if e.get("event") == "emit"]
    total = len(emit_events)

    if total == 0:
        return CoordinationKpis(
            decisions_per_envelope_ratio=0.0,
            refuse_rate=0.0,
            escalate_rate=0.0,
            verdict="good",
        )

    decide_count = sum(1 for e in emit_events if e.get("performative") == "DECIDE")
    refuse_count = sum(1 for e in emit_events if e.get("performative") == "REFUSE")
    escalate_count = sum(1 for e in emit_events if e.get("performative") == "ESCALATE")

    decisions_per_envelope_ratio = decide_count / total
    refuse_rate = refuse_count / total
    escalate_rate = escalate_count / total

    if escalate_rate < 0.10 and refuse_rate < 0.05:
        verdict: Literal["good", "warn", "poor"] = "good"
    elif escalate_rate > 0.30 or refuse_rate > 0.20:
        verdict = "poor"
    else:
        verdict = "warn"

    return CoordinationKpis(
        decisions_per_envelope_ratio=decisions_per_envelope_ratio,
        refuse_rate=refuse_rate,
        escalate_rate=escalate_rate,
        verdict=verdict,
    )


def _topology(events: list[dict[str, object]]) -> TopologyKpis:
    """Classify thread topology from directed ``from → to`` edges.

    Only ``emit`` events contribute edges (each emit is one logical hop).

    Algorithm (ordered):
    1. Build directed graph: set of (from_slug, to_slug) edges; collect
       in-degree and out-degree per node.
    2. Detect cycles via DFS on the directed graph. If any cycle exists →
       ``degenerate``.
    3. Compute in-degree per node from *distinct senders*.  If any node
       has in-degree ≥ 3 from ≥ 3 distinct senders → ``star``.
    4. If every node has in-degree ≤ 1 AND out-degree ≤ 1 → ``chain``.
    5. Otherwise → ``graph`` (DAG with branches).

    ``branch_count`` = number of nodes with out-degree > 1.
    ``hub_eidolon``  = slug of the star hub (step 3), else ``None``.
    """
    emit_events = [e for e in events if e.get("event") == "emit"]

    if not emit_events:
        return TopologyKpis(
            topology="chain",
            hub_eidolon=None,
            branch_count=0,
            cycle_detected=False,
        )

    # Collect edges as (from_slug, to_slug) pairs and adjacency structures.
    edges: list[tuple[str, str]] = []
    for ev in emit_events:
        frm = _slug(ev.get("from"))
        to = _slug(ev.get("to"))
        if frm and to:
            edges.append((frm, to))

    # Unique nodes.
    nodes: set[str] = set()
    for f, t in edges:
        nodes.add(f)
        nodes.add(t)

    # Out-degree and in-degree by slug.
    out_degree: dict[str, int] = {n: 0 for n in nodes}
    in_degree: dict[str, int] = {n: 0 for n in nodes}
    # For star detection: map each target → set of distinct senders.
    senders_for: dict[str, set[str]] = {n: set() for n in nodes}

    for f, t in edges:
        out_degree[f] += 1
        in_degree[t] += 1
        senders_for[t].add(f)

    # Cycle detection via iterative DFS.
    cycle_detected = _has_cycle(nodes, edges)

    # Branch count = nodes with out-degree > 1.
    branch_count = sum(1 for d in out_degree.values() if d > 1)

    if cycle_detected:
        return TopologyKpis(
            topology="degenerate",
            hub_eidolon=None,
            branch_count=branch_count,
            cycle_detected=True,
        )

    # Star detection: find a node with ≥ 3 distinct senders.
    hub: str | None = None
    for node in sorted(nodes):  # deterministic
        if len(senders_for[node]) >= 3:
            hub = node
            break

    if hub is not None:
        return TopologyKpis(
            topology="star",
            hub_eidolon=hub,
            branch_count=branch_count,
            cycle_detected=False,
        )

    # Chain: every node has in-degree ≤ 1 AND out-degree ≤ 1.
    is_chain = all(d <= 1 for d in in_degree.values()) and all(
        d <= 1 for d in out_degree.values()
    )

    if is_chain:
        return TopologyKpis(
            topology="chain",
            hub_eidolon=None,
            branch_count=branch_count,
            cycle_detected=False,
        )

    return TopologyKpis(
        topology="graph",
        hub_eidolon=None,
        branch_count=branch_count,
        cycle_detected=False,
    )


def _has_cycle(nodes: set[str], edges: list[tuple[str, str]]) -> bool:
    """Return True if the directed graph has at least one cycle (DFS)."""
    # Build adjacency list.
    adj: dict[str, list[str]] = {n: [] for n in nodes}
    for f, t in edges:
        adj[f].append(t)

    # DFS colouring: 0 = white (unvisited), 1 = grey (in stack), 2 = black (done).
    colour: dict[str, int] = {n: 0 for n in nodes}

    for start in sorted(nodes):  # deterministic traversal order
        if colour[start] != 0:
            continue
        stack = [(start, False)]
        while stack:
            node, leaving = stack.pop()
            if leaving:
                colour[node] = 2
                continue
            if colour[node] == 1:
                return True  # back-edge detected
            if colour[node] == 2:
                continue
            colour[node] = 1
            stack.append((node, True))  # mark for post-visit
            for neighbour in sorted(adj[node]):
                if colour[neighbour] == 1:
                    return True
                if colour[neighbour] == 0:
                    stack.append((neighbour, False))

    return False


def _competition(events: list[dict[str, object]]) -> CompetitionKpis:
    """Compute competition resilience KPIs.

    Counts ``CRITIQUE`` performatives among all ``emit`` events.

    Verdict thresholds:
    - ``low``      — critique_fraction < 0.10
    - ``moderate`` — 0.10 ≤ critique_fraction ≤ 0.30
    - ``strong``   — critique_fraction > 0.30
    """
    emit_events = [e for e in events if e.get("event") == "emit"]
    total = len(emit_events)
    critique_count = sum(1 for e in emit_events if e.get("performative") == "CRITIQUE")

    if total == 0:
        return CompetitionKpis(
            critique_count=0,
            total_envelopes=0,
            critique_fraction=0.0,
            verdict="low",
        )

    critique_fraction = critique_count / total

    if critique_fraction > 0.30:
        verdict: Literal["low", "moderate", "strong"] = "strong"
    elif critique_fraction >= 0.10:
        verdict = "moderate"
    else:
        verdict = "low"

    return CompetitionKpis(
        critique_count=critique_count,
        total_envelopes=total,
        critique_fraction=critique_fraction,
        verdict=verdict,
    )


def _plan_exec(events: list[dict[str, object]]) -> PlanExecKpis:
    """Compute planning vs execution divergence KPIs.

    ``spectra_propose_count`` — emit events where ``from`` starts with
    ``spectra@`` (any performative; SPECTRA's primary role is proposing specs).

    ``apivr_escalate_count`` — emit events where ``from`` starts with
    ``apivr@`` AND ``performative == "ESCALATE"``.

    Verdict:
    - ``n/a``       — spectra_propose_count == 0
    - ``aligned``   — ratio < 0.50
    - ``divergent`` — ratio ≥ 0.50
    """
    emit_events = [e for e in events if e.get("event") == "emit"]

    spectra_propose_count = 0
    apivr_escalate_count = 0

    for ev in emit_events:
        frm = ev.get("from")
        perf = ev.get("performative")
        if isinstance(frm, str) and frm.startswith("spectra@"):
            spectra_propose_count += 1
        if isinstance(frm, str) and frm.startswith("apivr@") and perf == "ESCALATE":
            apivr_escalate_count += 1

    if spectra_propose_count == 0:
        return PlanExecKpis(
            spectra_propose_count=0,
            apivr_escalate_count=apivr_escalate_count,
            ratio=None,
            verdict="n/a",
        )

    ratio = apivr_escalate_count / spectra_propose_count
    verdict: Literal["aligned", "divergent", "n/a"] = (
        "divergent" if ratio >= 0.50 else "aligned"
    )

    return PlanExecKpis(
        spectra_propose_count=spectra_propose_count,
        apivr_escalate_count=apivr_escalate_count,
        ratio=ratio,
        verdict=verdict,
    )


def _report_for_thread(
    thread_id: str, events: list[dict[str, object]]
) -> KpiReport:
    """Build a full KpiReport from a list of parsed trace events for one thread."""
    emit_events = [e for e in events if e.get("event") == "emit"]
    envelope_count = len(emit_events)

    # Collect unique eidolon slugs from both from and to fields.
    eidolon_set: set[str] = set()
    for ev in emit_events:
        frm_slug = _slug(ev.get("from"))
        to_slug = _slug(ev.get("to"))
        if frm_slug:
            eidolon_set.add(frm_slug)
        if to_slug:
            eidolon_set.add(to_slug)

    return KpiReport(
        thread_id=thread_id,
        envelope_count=envelope_count,
        eidolons=sorted(eidolon_set),
        coordination=_coordination(events),
        topology=_topology(events),
        competition=_competition(events),
        plan_exec=_plan_exec(events),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def evaluate_thread(
    trace_dir: pathlib.Path,
    thread_id: str | None = None,
) -> list[KpiReport]:
    """Evaluate ECL thread(s) from JSONL trace files.

    Parameters
    ----------
    trace_dir:
        Directory containing ``<thread_id>.jsonl`` trace files.
    thread_id:
        When supplied, evaluate only ``<trace_dir>/<thread_id>.jsonl``.
        When ``None``, iterate all ``*.jsonl`` files in ``trace_dir``
        (lexicographic order, matching ``LC_ALL=C sort`` — same as TS
        traceTail) and return one report per thread.

    Returns
    -------
    list[KpiReport]
        One report per thread, in file-discovery order.
        Returns an empty list if no JSONL files are found.
    """
    if thread_id is not None:
        jsonl_path = trace_dir / f"{thread_id}.jsonl"
        events = _read_events(jsonl_path)
        return [_report_for_thread(thread_id, events)]

    # Glob all *.jsonl files, sorted lexicographically.
    files = sorted(trace_dir.glob("*.jsonl"))
    reports: list[KpiReport] = []
    for jsonl_path in files:
        tid = jsonl_path.stem
        events = _read_events(jsonl_path)
        reports.append(_report_for_thread(tid, events))
    return reports
