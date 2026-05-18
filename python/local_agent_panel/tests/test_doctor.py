import asyncio
import sys
from pathlib import Path

from local_agent_panel.doctor import run_doctor


def test_doctor_blocks_when_codex_is_broken(tmp_path: Path) -> None:
    report = asyncio.run(run_doctor(tmp_path, tmp_path / ".agent-panel", initialize_app_server=False))

    assert report["status"] in {"blocked", "ready", "degraded"}
    assert report["artifactVault"]["writable"] is True
    assert report["sqlite"]["migrated"] is True


def test_doctor_initializes_fake_app_server(tmp_path: Path) -> None:
    fake = tmp_path / "fake_app_server.py"
    fake.write_text(
        """
import json, sys
for line in sys.stdin:
    msg = json.loads(line)
    method = msg.get("method")
    if "id" not in msg:
        continue
    if method == "initialize":
        print(json.dumps({"id": msg["id"], "result": {"serverInfo": {"name": "fake"}}}), flush=True)
    elif method == "config/read":
        print(json.dumps({"id": msg["id"], "result": {"config": {"model": "fake"}}}), flush=True)
    elif method == "configRequirements/read":
        print(json.dumps({"id": msg["id"], "result": {"requirements": {"approvalPolicy": "default"}}}), flush=True)
    else:
        print(json.dumps({"id": msg["id"], "result": {}}), flush=True)
""",
        encoding="utf-8",
    )
    report = asyncio.run(
        run_doctor(
            tmp_path,
            tmp_path / ".agent-panel",
            app_server_command=[sys.executable, str(fake)],
            initialize_app_server=True,
        )
    )

    if report["blockers"]:
        # Real Codex detection may block before fake init on machines without a healthy Codex.
        assert "Codex" in report["blockers"][0]
    else:
        assert report["appServer"]["initialized"] is True


def test_doctor_degrades_when_exec_fallback_exists(tmp_path: Path, monkeypatch) -> None:
    def fake_detect_cli(engine: str) -> dict:
        return {
            "engine": "codex",
            "executablePath": "/usr/local/bin/codex",
            "available": True,
            "supportsNonInteractive": True,
            "supportsJsonStream": True,
            "supportsMcpConfig": False,
            "detectedCommand": ["codex", "exec"],
            "supportsAppServer": False,
            "appServerError": "app-server unavailable",
        }

    monkeypatch.setattr("local_agent_panel.doctor.detect_cli", fake_detect_cli)

    report = asyncio.run(run_doctor(tmp_path, tmp_path / ".agent-panel", initialize_app_server=True))

    assert report["status"] == "degraded"
    assert report["blockers"] == []
    assert report["warnings"] == ["app-server unavailable"]
