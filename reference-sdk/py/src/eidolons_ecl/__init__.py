"""eidolons_ecl — ECL Python reference SDK.

Re-exports the two public symbols that are stable at the scaffold stage.
Full module surface (envelope, eval, migrate, a2a_bridge, compose_gen)
lands in subsequent Phase 2.A/2.B stories.
"""

from .errors import EclError
from .version import ECL_VERSION_TARGET

__all__ = ["ECL_VERSION_TARGET", "EclError"]
