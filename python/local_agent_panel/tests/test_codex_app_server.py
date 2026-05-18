import asyncio
import sys
from pathlib import Path

from local_agent_panel.codex_app_server import CodexAppServerAdapter
from local_agent_panel.storage import AgentPanelStore


def test_fake_app_server_protocol_turn_success(tmp_path: Path) -> None:
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
        print(json.dumps({"id": msg["id"], "result": {"requirements": {"sandbox": "workspace-write"}}}), flush=True)
    elif method == "thread/start":
        print(json.dumps({"id": msg["id"], "result": {"thread": {"id": "thread_fake"}}}), flush=True)
    elif method == "turn/start":
        print(json.dumps({"method": "turn/started", "params": {"threadId": "thread_fake", "turnId": "turn_fake"}}), flush=True)
        print(json.dumps({"method": "item/agentMessage/delta", "params": {"threadId": "thread_fake", "turnId": "turn_fake", "delta": "ok"}}), flush=True)
        print(json.dumps({"id": msg["id"], "result": {"turn": {"id": "turn_fake"}}}), flush=True)
        print(json.dumps({"method": "turn/completed", "params": {"threadId": "thread_fake", "turnId": "turn_fake", "status": "completed"}}), flush=True)
    else:
        print(json.dumps({"id": msg["id"], "result": {}}), flush=True)
""",
        encoding="utf-8",
    )

    async def run() -> list[str]:
        store = AgentPanelStore(tmp_path / ".agent-panel", project_root=tmp_path)
        run_obj = store.create_run("Say ok", "codex", str(tmp_path), dry_run=False)
        adapter = CodexAppServerAdapter(store, run_obj["id"], command=[sys.executable, str(fake)], cwd=tmp_path)
        await adapter.start()
        await adapter.initialize()
        assert await adapter.config_read() == {"model": "fake"}
        assert await adapter.config_requirements_read() == {"sandbox": "workspace-write"}
        thread_id = await adapter.start_thread(str(tmp_path))
        turn_id = await adapter.start_turn(thread_id, "Say ok", str(tmp_path), [])
        seen: list[str] = []
        async for event in adapter.events():
            seen.append(event["type"])
            if event["type"] == "turn.completed":
                break
        await adapter.close()
        assert turn_id == "turn_fake"
        return seen

    seen = asyncio.run(run())
    assert "turn.started" in seen
    assert "message.delta" in seen
    assert "turn.completed" in seen


def test_fake_app_server_approval_response_uses_request_id(tmp_path: Path) -> None:
    fake = tmp_path / "fake_app_server_approval.py"
    fake.write_text(
        """
import json, sys
for line in sys.stdin:
    msg = json.loads(line)
    method = msg.get("method")
    if method == "initialize":
        print(json.dumps({"id": msg["id"], "result": {"serverInfo": {"name": "fake"}}}), flush=True)
    elif method == "thread/start":
        print(json.dumps({"id": msg["id"], "result": {"thread": {"id": "thread_fake"}}}), flush=True)
    elif method == "turn/start":
        print(json.dumps({"id": msg["id"], "result": {"turn": {"id": "turn_fake"}}}), flush=True)
        print(json.dumps({"method": "item/commandExecution/requestApproval", "id": "approval-1", "params": {"threadId": "thread_fake", "turnId": "turn_fake", "itemId": "item_1", "command": "echo ok"}}), flush=True)
    elif msg.get("id") == "approval-1" and msg.get("result") == "accept":
        print(json.dumps({"method": "serverRequest/resolved", "params": {"threadId": "thread_fake", "turnId": "turn_fake", "requestId": "approval-1"}}), flush=True)
        print(json.dumps({"method": "turn/completed", "params": {"threadId": "thread_fake", "turnId": "turn_fake", "status": "completed"}}), flush=True)
    elif "id" in msg:
        print(json.dumps({"id": msg["id"], "result": {}}), flush=True)
""",
        encoding="utf-8",
    )

    async def run() -> tuple[list[str], dict]:
        store = AgentPanelStore(tmp_path / ".agent-panel", project_root=tmp_path)
        run_obj = store.create_run("Approve echo", "codex", str(tmp_path), dry_run=False)
        adapter = CodexAppServerAdapter(store, run_obj["id"], command=[sys.executable, str(fake)], cwd=tmp_path)
        await adapter.start()
        await adapter.initialize()
        thread_id = await adapter.start_thread(str(tmp_path))
        await adapter.start_turn(thread_id, "Approve echo", str(tmp_path), [])
        seen: list[str] = []
        approval_payload = {}
        async for event in adapter.events():
            seen.append(event["type"])
            if event["type"] == "approval.command.requested":
                approval_payload = event["payload"]
                await adapter.respond_to_approval(approval_payload, "allow_once")
            if event["type"] == "turn.completed":
                break
        await adapter.close()
        return seen, approval_payload

    seen, payload = asyncio.run(run())
    assert payload["requestId"] == "approval-1"
    assert payload["command"] == "echo ok"
    assert "approval.command.requested" in seen
    assert "approval.resolved" in seen
    assert "turn.completed" in seen
