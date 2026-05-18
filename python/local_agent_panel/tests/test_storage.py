import json
from pathlib import Path

from local_agent_panel.storage import AgentPanelStore


def test_upload_hash_preview_and_run_manifest(tmp_path: Path) -> None:
    store = AgentPanelStore(tmp_path)
    source = store.upload_file("rooms.csv", b"room,area\nKitchen,180\n", "text/csv")

    assert source["sha256"]
    assert source["previewText"].startswith("room,area")
    assert source["confidence"] == "uploaded"

    run = store.create_run("Create a quantity summary", "codex", str(tmp_path), [source["id"]], dry_run=True)
    assert run["status"] == "blocked"
    assert run["sourceFiles"][0]["storedPath"].startswith(str(tmp_path / "runs" / run["id"]))

    manifest_path = tmp_path / "runs" / run["id"] / "stage_manifest.json"
    manifest = json.loads(manifest_path.read_text())
    assert manifest["schemaVersion"] == 1
    assert manifest["sourceHashes"][source["id"]] == source["sha256"]
    assert manifest["blockers"] == ["Dry run requested."]
    assert manifest["diagnosticsPath"].endswith("diagnostics.json")


def test_run_defaults_to_project_root(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    storage_root = tmp_path / ".agent-panel"
    project_root.mkdir()
    store = AgentPanelStore(storage_root, project_root=project_root)

    run = store.create_run("Use the configured project root", "codex", dry_run=True)

    assert run["cwd"] == str(project_root)


def test_needs_ingest_for_deep_formats(tmp_path: Path) -> None:
    store = AgentPanelStore(tmp_path)
    source = store.upload_file("plan.pdf", b"%PDF-1.7", "application/pdf")

    assert source["confidence"] == "needs-ingest"
    assert "previewText" not in source


def test_xlsx_gets_structured_preview_tier(tmp_path: Path) -> None:
    import io
    import zipfile

    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", "<worksheet />")

    store = AgentPanelStore(tmp_path)
    source = store.upload_file("book.xlsx", data.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    assert source["ingestTier"] == 2
    assert source["previewAvailable"] is True
    assert "xl/worksheets/sheet1.xml" in source["previewText"]


def test_approval_lifecycle(tmp_path: Path) -> None:
    store = AgentPanelStore(tmp_path)
    run = store.create_run("Need approval", "codex", str(tmp_path), dry_run=True)
    event = store.add_event(
        run["id"],
        "approval.command.requested",
        "Approval requested",
        {"requestId": "approval-1", "command": "echo ok", "reason": "test"},
        source="codex.app_server",
    )
    approval = store.create_approval_from_event(event)
    assert approval["status"] == "pending"

    resolved = store.resolve_approval("approval-1", "allow_once")
    assert resolved["status"] == "allowed"
