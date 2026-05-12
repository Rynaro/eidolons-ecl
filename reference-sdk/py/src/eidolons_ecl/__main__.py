"""eidolons-ecl CLI entry point.

Sub-commands are registered here as stubs; implementations land in the
stories listed in each ``NotImplementedError`` message.
"""

from __future__ import annotations

import argparse
import sys

from .version import __version__


def cmd_eval(args: argparse.Namespace) -> int:
    from pathlib import Path

    from .eval import evaluate_thread
    from .eval.report import render_json, render_markdown

    trace_dir = Path(args.trace_dir)
    if not trace_dir.is_dir():
        print(f"trace-dir not found: {trace_dir}", file=sys.stderr)
        return 1
    reports = evaluate_thread(trace_dir, thread_id=args.thread)
    if not reports:
        print("No thread JSONL files found.", file=sys.stderr)
        return 1
    for report in reports:
        md = render_markdown(report)
        js = render_json(report)
        if args.out:
            Path(args.out).write_text(md, encoding="utf-8")
        else:
            print(md)
        if args.out_json:
            Path(args.out_json).write_text(js, encoding="utf-8")
    return 0


def cmd_migrate(args: argparse.Namespace) -> int:
    from pathlib import Path

    from .migrate import backfill_directory
    from .migrate.backfill import render_markdown

    root = Path(args.root)
    if not root.is_dir():
        print(f"root dir not found: {root}", file=sys.stderr)
        return 1
    report = backfill_directory(root, dry_run=args.dry_run)
    print(f"scanned: {report.scanned_count}")
    print(f"created: {report.created_count}")
    print(f"skipped_existing: {report.skipped_existing_count}")
    print(f"skipped_unknown: {report.skipped_unknown_count}")
    if args.report:
        Path(args.report).write_text(render_markdown(report), encoding="utf-8")
    return 0


def cmd_a2a_card(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.4 (Phase 2.B) not landed")


def cmd_a2a_translate(args: argparse.Namespace) -> int:
    raise NotImplementedError("Story S2.4 (Phase 2.B) not landed")


def cmd_compose_gen(args: argparse.Namespace) -> int:
    from pathlib import Path

    from .compose_gen import render_composition

    contracts_dir = Path(args.contracts)
    template_path = Path(args.template)
    if not contracts_dir.is_dir():
        print(f"contracts dir not found: {contracts_dir}", file=sys.stderr)
        return 1
    if not template_path.is_file():
        print(f"template not found: {template_path}", file=sys.stderr)
        return 1
    rendered = render_composition(contracts_dir, template_path)
    if args.out:
        Path(args.out).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


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
    migrate_p.add_argument("--dry-run", action="store_true", default=False)
    migrate_p.add_argument("--report", default=None, help="write Markdown report to this path")
    migrate_p.set_defaults(func=cmd_migrate)

    # a2a-card — S2.4 (Phase 2.B)
    card_p = sub.add_parser("a2a-card", help="emit an Agent Card from the roster")
    card_p.add_argument("--roster", required=True)
    card_p.add_argument("--out")
    card_p.set_defaults(func=cmd_a2a_card)

    # a2a-translate — S2.4 (Phase 2.B)
    tr_p = sub.add_parser("a2a-translate", help="translate inbound A2A Message to ECL envelope")
    tr_p.add_argument("--message", required=True)
    tr_p.add_argument("--out")
    tr_p.set_defaults(func=cmd_a2a_translate)

    # compose-gen — S2.5
    compose_p = sub.add_parser(
        "compose-gen", help="regenerate methodology/composition.md from contracts"
    )
    compose_p.add_argument("--contracts", required=True)
    compose_p.add_argument("--template", required=True)
    compose_p.add_argument("--out")
    compose_p.set_defaults(func=cmd_compose_gen)

    args = parser.parse_args(argv)
    return args.func(args) if hasattr(args, "func") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
