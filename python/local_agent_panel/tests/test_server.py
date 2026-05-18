import base64

import pytest

from local_agent_panel.server import create_app
from local_agent_panel.storage import AgentPanelStore


def test_fastapi_upload_run_sse_and_approval(tmp_path) -> None:
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    store = AgentPanelStore(tmp_path / ".agent-panel", project_root=tmp_path)
    app = create_app(store, project=str(tmp_path), storage_root=str(tmp_path / ".agent-panel"))
    client = TestClient(app)

    health = client.get("/v1/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True

    upload = client.post(
        "/v1/uploads",
        json={
            "name": "rooms.csv",
            "mimeType": "text/csv",
            "contentBase64": base64.b64encode(b"room,area\nKitchen,180\n").decode(),
        },
    )
    assert upload.status_code == 200
    file_id = upload.json()["file"]["id"]

    run = client.post(
        "/v1/runs",
        json={"request": "Summarize attached file", "engine": "codex", "sourceFileIds": [file_id], "dryRun": True},
    )
    assert run.status_code == 200
    run_id = run.json()["run"]["id"]

    sse = client.get(f"/v1/runs/{run_id}/events.sse")
    assert sse.status_code == 200
    assert "run.created" in sse.text

    event = store.add_event(
        run_id,
        "approval.command.requested",
        "Approval requested",
        {"requestId": "approval-server-1", "command": "echo ok"},
        source="codex.app_server",
    )
    store.create_approval_from_event(event)
    approval = client.post("/v1/approvals/approval-server-1", json={"decision": "deny"})
    assert approval.status_code == 200
    assert approval.json()["approval"]["status"] == "denied"

    diagnostics = client.get(f"/v1/runs/{run_id}/diagnostics")
    assert diagnostics.status_code == 200
    assert diagnostics.json()["bundlePath"].endswith("diagnostics-bundle.zip")
