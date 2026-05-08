# Mission

Audit `cli/install.sh` for dead code that can be safely removed without
changing observable behaviour. Produce a spec for the cleanup, then
implement it.

DECISION_TARGET: Which lines or functions in `cli/install.sh` are
provably unreachable from any documented entry path?
