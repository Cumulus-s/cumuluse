from __future__ import annotations

import argparse
import json

from .doctor import doctor_sync
from .config import AgentPanelConfig
from .storage import AgentPanelStore
from .supervisor import RunSupervisor


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agent-panel")
    parser.add_argument("--project", default=".")
    parser.add_argument("--storage-root", default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor")

    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8792)
    serve.add_argument("--host", default="127.0.0.1")

    run = sub.add_parser("run")
    run.add_argument("request")
    run.add_argument("--engine", choices=["codex", "claude"], default="codex")
    run.add_argument("--cwd", default=None)
    run.add_argument("--source-file-id", action="append", default=[])
    run.add_argument("--dry-run", action="store_true")

    status = sub.add_parser("status")
    status.add_argument("run_id")

    stop = sub.add_parser("stop")
    stop.add_argument("run_id")

    bundle = sub.add_parser("bundle")
    bundle.add_argument("run_id")

    args = parser.parse_args(argv)
    config = AgentPanelConfig.load(args.project, args.storage_root)
    config.ensure_written()
    store = AgentPanelStore(config.storage_root, project_root=config.project_root)

    if args.command == "doctor":
        print(json.dumps(doctor_sync(args.project, args.storage_root), indent=2))
        return 0

    if args.command == "serve":
        try:
            import uvicorn
            from .server import create_app
        except ImportError as exc:
            raise SystemExit("Install cumuluse-backend[server] to use `cumuluse-backend serve`.") from exc
        uvicorn.run(create_app(store, project=args.project, storage_root=args.storage_root), host=args.host, port=args.port)
        return 0

    if args.command == "run":
        dry_run = args.dry_run
        run_obj = store.create_run(args.request, args.engine, args.cwd, args.source_file_id, dry_run=dry_run)
        if not dry_run:
            RunSupervisor(store).start(run_obj["id"])
        print(json.dumps(run_obj, indent=2))
        return 0

    if args.command == "status":
        print(json.dumps({"run": store.get_run(args.run_id), "events": store.events(args.run_id), "approvals": store.approvals(args.run_id)}, indent=2))
        return 0

    if args.command == "stop":
        RunSupervisor(store).stop(args.run_id)
        print(json.dumps(store.get_run(args.run_id), indent=2))
        return 0

    if args.command == "bundle":
        print(json.dumps({"bundlePath": str(store.create_bundle(args.run_id))}, indent=2))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
