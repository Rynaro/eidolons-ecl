"""eidolons-ecl CLI entry point.

Sub-commands are registered here as stubs; implementations land in the
stories listed in each ``NotImplementedError`` message.
"""

from __future__ import annotations

import argparse
import sys

from .version import __version__


def cmd_eval(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.1 not landed")


def cmd_migrate(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.2 (Phase 2.B) not landed")


def cmd_a2a_card(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.4 (Phase 2.B) not landed")


def cmd_a2a_translate(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.4 (Phase 2.B) not landed")


def cmd_compose_gen(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.5 not landed")


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns an integer exit code."""
    parser = argparse.ArgumentParser(
        prog="eidolons-ecl",
        description="ECL Python SDK CLI",
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    # eval — S2.1
    eval_p = sub.add_parser("eval", help="evaluate a thread of envelopes")
    eval_p.add_argument("--trace-dir", required=True)
    eval_p.add_argument("--thread")
    eval_p.add_argument("--out")
    eval_p.add_argument("--out-json")
    eval_p.set_defaults(func=cmd_eval)

    # migrate — S2.2 (Phase 2.B)
    migrate_p = sub.add_parser("migrate", help="back-fill envelopes for legacy artefacts")
    migrate_p.add_argument("--root", required=True)
    migrate_p.set_defaults(func=cmd_migrate)

    # a2a-card — S2.4 (Phase 2.B)
    card_p = sub.add_parser("a2a-card", help="emit an Agent Card from the roster")
    card_p.add_argument("--roster", required=True)
    card_p.add_argument("--out")
    card_p.set_defaults(func=cmd_a2a_card)

    # a2a-translate — S2.4 (Phase 2.B)
    tr_p = sub.add_parser(
        "a2a-translate", help="translate inbound A2A Message to ECL envelope"
    )
    tr_p.add_argument("--message", required=True)
    tr_p.add_argument("--out")
    tr_p.set_defaults(func=cmd_a2a_translate)

    # compose-gen — S2.5
    compose_p = sub.add_parser(
        "compose-gen", help="regenerate methodology/composition.md from contracts"
    )
    compose_p.add_argument("--contracts", required=True)
    compose_p.add_argument("--template", required=True)
    compose_p.add_argument("--out", required=True)
    compose_p.set_defaults(func=cmd_compose_gen)

    args = parser.parse_args(argv)
    return args.func(args) if hasattr(args, "func") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
