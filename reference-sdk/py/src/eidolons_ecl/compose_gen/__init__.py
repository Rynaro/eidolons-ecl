"""ECL composition.md generator — Story S2.5.

Regenerates the hand-off table in ``methodology/composition.md`` from the
machine-readable contract definitions in ``contracts/*.yaml``.

Public API::

    from eidolons_ecl.compose_gen import render_composition
    md = render_composition(
        contracts_dir=pathlib.Path("contracts"),
        template_path=pathlib.Path(
            "reference-sdk/py/src/eidolons_ecl/compose_gen/templates/composition.md.j2"
        ),
    )
"""

from __future__ import annotations

from .render import render_composition

__all__ = ["render_composition"]
