"""ECL evaluation framework — Story S2.1.

Exposes the top-level public API for thread KPI evaluation.

Usage::

    from eidolons_ecl.eval import evaluate_thread, KpiReport, TopologyClass
    reports = evaluate_thread(pathlib.Path(".eidolons/.trace"))
"""

from __future__ import annotations

from .kpi import KpiReport, TopologyClass, evaluate_thread

__all__ = ["evaluate_thread", "KpiReport", "TopologyClass"]
