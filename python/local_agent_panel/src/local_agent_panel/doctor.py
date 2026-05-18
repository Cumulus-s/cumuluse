from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from .adapters import detect_cli
from .codex_app_server import CodexAppServerAdapter
from .config import AgentPanelConfig
from .contracts import CapabilityReport
from .storage import AgentPanelStore


async def run_doctor(
    project: str | Path | None = None,
    storage_root: str | Path | None = None,
    *,
    app_server_command: list[str] | None = None,
    initialize_app_server: bool = True,
) -> CapabilityReport:
    config = AgentPanelConfig.load(project, storage_root)
    config.ensure_written()
    store = AgentPanelStore(config.storage_root, project_root=config.project_root)
    blockers: list[str] = []
    warnings: list[str] = []
    codex = detect_cli("codex")
    app_server: dict[str, Any] = {"initialized": False}
    effective_config: dict[str, Any] | None = None
    requirements: dict[str, Any] | None = None

    using_override = app_server_command is not None
    if not codex.get("executablePath") and not using_override:
        blockers.append("Codex executable was not found on PATH.")
    elif not codex.get("supportsAppServer") and not using_override:
        if codex.get("supportsNonInteractive"):
            warnings.append(codex.get("appServerError") or "Codex app-server is not available; using degraded codex exec fallback.")
        else:
            blockers.append(codex.get("appServerError") or "Codex app-server is not available.")

    if initialize_app_server and not blockers and (using_override or codex.get("supportsAppServer")):
        run = store.create_run("Codex app-server preflight", "codex", str(config.project_root), dry_run=False)
        store.set_run_status(run["id"], "preflighting", "Initializing Codex app-server.")
        adapter = CodexAppServerAdapter(store, run["id"], command=app_server_command, cwd=config.project_root)
        try:
            await adapter.start()
            init_result = await adapter.initialize()
            effective_config = await adapter.config_read()
            requirements = await adapter.config_requirements_read()
            app_server = {"initialized": True, "initializeResult": init_result}
            store.set_run_status(run["id"], "ready", "Codex app-server preflight passed.")
            store.write_manifest(run["id"], [])
        except Exception as exc:
            blockers.append(f"Codex app-server initialization failed: {exc}")
            app_server = {"initialized": False, "error": str(exc)}
            store.set_run_status(run["id"], "blocked", str(exc))
            store.write_manifest(run["id"], [str(exc)])
        finally:
            await adapter.close()

    artifact_ok = _writable(config.storage_root)
    sqlite_ok = store.db_path.exists()
    if not artifact_ok:
        blockers.append(f"Artifact vault is not writable: {config.storage_root}")
    if not sqlite_ok:
        blockers.append("SQLite state store was not created.")

    status = "blocked" if blockers else "degraded" if warnings else "ready"
    report: CapabilityReport = {
        "status": status,
        "projectRoot": str(config.project_root),
        "storageRoot": str(config.storage_root),
        "codex": codex,
        "appServer": app_server,
        "effectiveConfig": effective_config,
        "configRequirements": requirements,
        "artifactVault": {"writable": artifact_ok, "path": str(config.storage_root)},
        "sqlite": {"migrated": sqlite_ok, "path": str(store.db_path)},
        "blockers": blockers,
        "warnings": warnings,
    }
    path = store.record_capability_report(report)
    report["artifactVault"]["capabilityReportPath"] = str(path)
    return report


def doctor_sync(
    project: str | Path | None = None,
    storage_root: str | Path | None = None,
    *,
    initialize_app_server: bool = True,
) -> CapabilityReport:
    return asyncio.run(run_doctor(project, storage_root, initialize_app_server=initialize_app_server))


def _writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False
