from __future__ import annotations

import json
import time

from .config import AgentPanelConfig
from .doctor import run_doctor
from .storage import AgentPanelStore
from .supervisor import RunSupervisor

try:
    from pydantic import BaseModel
except ImportError:  # pragma: no cover - importing this module without server extras
    BaseModel = object  # type: ignore[assignment,misc]


class FileUpload(BaseModel):
    name: str
    contentBase64: str
    mimeType: str = "application/octet-stream"


class RunCreate(BaseModel):
    request: str
    engine: str = "codex"
    cwd: str | None = None
    sourceFileIds: list[str] = []
    dryRun: bool = False


class ThreadCreate(BaseModel):
    cwd: str | None = None
    title: str | None = None


class TurnCreate(BaseModel):
    request: str
    engine: str = "codex"
    sourceFileIds: list[str] = []
    dryRun: bool = False


class ApprovalDecision(BaseModel):
    decision: str


def create_app(store: AgentPanelStore | None = None, project: str | None = None, storage_root: str | None = None):
    try:
        from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
        from fastapi.responses import StreamingResponse
    except ImportError as exc:  # pragma: no cover - exercised by CLI error path
        raise RuntimeError("Install cumuluse-backend[server] to use the FastAPI app.") from exc

    config = AgentPanelConfig.load(project, storage_root)
    config.ensure_written()
    app = FastAPI(title="cumuluse-backend")
    store = store or AgentPanelStore(config.storage_root, project_root=config.project_root)
    supervisor = RunSupervisor(store)

    @app.get("/v1/health")
    def health():
        return {"ok": True}

    @app.get("/v1/capabilities")
    async def capabilities(cwd: str | None = None):
        return await run_doctor(cwd or str(config.project_root), str(config.storage_root), initialize_app_server=False)

    @app.get("/v1/projects/current")
    def current_project():
        return {"projectRoot": str(config.project_root), "storageRoot": str(config.storage_root)}

    @app.post("/v1/uploads")
    def upload(body: FileUpload):
        return {"file": store.upload_file_base64(body.name, body.contentBase64, body.mimeType)}

    @app.post("/v1/files")
    def upload_file(body: FileUpload):
        return {"file": store.upload_file_base64(body.name, body.contentBase64, body.mimeType)}

    @app.post("/v1/threads")
    def create_thread(body: ThreadCreate):
        run = store.create_run(body.title or "New local Codex thread", "codex", body.cwd or str(config.project_root), dry_run=True)
        return {"thread": {"id": run["id"], "runId": run["id"], "cwd": run["cwd"]}}

    @app.post("/v1/threads/{thread_id}/turns")
    def create_turn(thread_id: str, body: TurnCreate):
        if body.engine != "codex":
            raise HTTPException(status_code=400, detail="v1 execution is Codex-first")
        run = store.create_run(body.request, "codex", str(config.project_root), body.sourceFileIds, dry_run=body.dryRun)
        store.record_thread(run["id"], thread_id, {"id": thread_id, "externalThreadRef": thread_id})
        if not body.dryRun:
            supervisor.start(run["id"])
        return {"run": run, "eventsUrl": f"/v1/runs/{run['id']}/events.sse", "manifestPath": run["outputs"][1]["path"]}

    @app.post("/v1/runs")
    def create_run(body: RunCreate):
        if body.engine != "codex":
            raise HTTPException(status_code=400, detail="v1 execution is Codex-first")
        run = store.create_run(body.request, body.engine, body.cwd, body.sourceFileIds, dry_run=body.dryRun)  # type: ignore[arg-type]
        if not body.dryRun:
            supervisor.start(run["id"])
        return {"run": run, "eventsUrl": f"/v1/runs/{run['id']}/events.sse", "manifestPath": run["outputs"][1]["path"]}

    @app.get("/v1/runs/{run_id}")
    def get_run(run_id: str):
        try:
            return {"run": store.get_run(run_id), "events": store.events(run_id), "approvals": store.approvals(run_id)}
        except KeyError:
            raise HTTPException(status_code=404, detail="run not found")

    @app.post("/v1/runs/{run_id}/cancel")
    def cancel_run(run_id: str):
        try:
            supervisor.stop(run_id)
            return {"run": store.get_run(run_id)}
        except KeyError:
            raise HTTPException(status_code=404, detail="run not found")

    @app.get("/v1/runs/{run_id}/events")
    @app.get("/v1/runs/{run_id}/events.sse")
    def events(run_id: str):
        def stream():
            seen: set[str] = set()
            while True:
                run = store.get_run(run_id)
                for event in store.events(run_id):
                    if event["event_id"] in seen:
                        continue
                    seen.add(event["event_id"])
                    yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
                if run["status"] in {"ready", "failed", "blocked", "cancelled", "interrupted"}:
                    break
                time.sleep(0.5)

        return StreamingResponse(stream(), media_type="text/event-stream")

    @app.get("/v1/runs/{run_id}/diagnostics")
    def diagnostics(run_id: str):
        try:
            return {"path": str(store.write_diagnostics(run_id)), "bundlePath": str(store.create_bundle(run_id))}
        except KeyError:
            raise HTTPException(status_code=404, detail="run not found")

    @app.post("/v1/approvals/{approval_id}")
    def approval_decision(approval_id: str, body: ApprovalDecision):
        if body.decision not in {"allow_once", "deny", "cancel"}:
            raise HTTPException(status_code=400, detail="decision must be allow_once, deny, or cancel")
        try:
            return {"approval": supervisor.approve(approval_id, body.decision)}
        except KeyError:
            raise HTTPException(status_code=404, detail="approval not found")

    @app.websocket("/v1/ws")
    async def websocket(websocket: WebSocket):
        await websocket.accept()
        try:
            while True:
                message = await websocket.receive_json()
                kind = message.get("type")
                if kind == "ping":
                    await websocket.send_json({"type": "pong"})
                elif kind == "approval.decide":
                    approval = supervisor.approve(str(message["approvalId"]), str(message["decision"]))
                    await websocket.send_json({"type": "approval.decided", "approval": approval})
                elif kind == "run.cancel":
                    supervisor.stop(str(message["runId"]))
                    await websocket.send_json({"type": "run.cancelled", "runId": message["runId"]})
                elif kind == "run.events":
                    run_id = str(message["runId"])
                    for event in store.events(run_id):
                        await websocket.send_json(event)
                else:
                    await websocket.send_json({"type": "error", "message": f"unknown message type: {kind}"})
        except WebSocketDisconnect:
            return

    return app
