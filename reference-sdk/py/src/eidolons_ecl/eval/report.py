"""KPI report rendering — Story S2.1.

Pure rendering functions: no side effects, no timestamps in output.
Determinism gate: identical input → identical output on every call.
"""

from __future__ import annotations

import json
from dataclasses import asdict

from .kpi import KpiReport


def render_markdown(report: KpiReport) -> str:
    """Render a KpiReport to a Markdown document.

    Output is pure (no timestamps, no randomness) so the determinism
    gate passes on repeated calls with identical input.

    Format
    ------
    A series of Markdown sections with definition-list style tables, one
    per KPI family. The thread_id appears in the H1 heading so the
    G-S2.1-Example-Pass gate can locate it.
    """
    coord = report.coordination
    topo = report.topology
    comp = report.competition
    pe = report.plan_exec

    lines: list[str] = [
        f"# ECL Thread KPI Report: {report.thread_id}",
        "",
        f"**Envelope count:** {report.envelope_count}  ",
        f"**Eidolons:** {', '.join(report.eidolons)}  ",
        "",
        "---",
        "",
        "## Coordination Quality",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| decisions_per_envelope_ratio | {coord.decisions_per_envelope_ratio:.4f} |",
        f"| refuse_rate | {coord.refuse_rate:.4f} |",
        f"| escalate_rate | {coord.escalate_rate:.4f} |",
        f"| verdict | **{coord.verdict}** |",
        "",
        "---",
        "",
        "## Topology Efficacy",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| topology | **{topo.topology}** |",
        f"| hub_eidolon | {topo.hub_eidolon if topo.hub_eidolon is not None else '—'} |",
        f"| branch_count | {topo.branch_count} |",
        f"| cycle_detected | {topo.cycle_detected} |",
        "",
        "---",
        "",
        "## Competition Resilience",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| critique_count | {comp.critique_count} |",
        f"| total_envelopes | {comp.total_envelopes} |",
        f"| critique_fraction | {comp.critique_fraction:.4f} |",
        f"| verdict | **{comp.verdict}** |",
        "",
        "---",
        "",
        "## Planning vs Execution Divergence",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| spectra_propose_count | {pe.spectra_propose_count} |",
        f"| apivr_escalate_count | {pe.apivr_escalate_count} |",
        f"| ratio | {f'{pe.ratio:.4f}' if pe.ratio is not None else 'n/a'} |",
        f"| verdict | **{pe.verdict}** |",
        "",
    ]
    return "\n".join(lines)


def render_json(report: KpiReport) -> str:
    """Render a KpiReport to a formatted JSON string.

    Uses ``json.dumps(..., sort_keys=True)`` for deterministic output.
    The ``dataclasses.asdict`` conversion is also deterministic.
    """
    return json.dumps(asdict(report), indent=2, sort_keys=True)
