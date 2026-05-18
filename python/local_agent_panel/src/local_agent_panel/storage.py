from __future__ import annotations

import base64
import hashlib
import json
import os
import shutil
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Iterable

from .contracts import AgentEngine, ApprovalRecord, NormalizedEvent, PanelRun, PanelRunStatus, PipelineOutput, SourceFile, StageManifest
from .ingestion import ingest_preview
from .redaction import Redactor
from .timeutil import utc_now


class AgentPanelStore:
    def __init__(self, root: str | Path | None = None, project_root: str | Path | None = None) -> None:
        self.root = Path(root or ".agent-panel").expanduser().resolve()
        self.project_root = Path(project_root or self.root.parent).expanduser().resolve()
        self.db_path = self.root / "state.sqlite3"
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "runs").mkdir(exist_ok=True)
        (self.root / "inbox").mkdir(exist_ok=True)
        (self.root / "logs").mkdir(exist_ok=True)
        self._migrate()

    def upload_file(self, name: str, content: bytes, mime_type: str = "application/octet-stream") -> SourceFile:
        original = Path(name).name or "upload.bin"
        file_id = str(uuid.uuid4())
        extension = original.rsplit(".", 1)[-1].lower() if "." in original else ""
        sha256 = hashlib.sha256(content).hexdigest()
        safe_name = f"{file_id}-{_safe_name(original)}"
        stored_path = self.root / "inbox" / safe_name
        stored_path.write_bytes(content)
        ingest = ingest_preview(original, content, mime_type)
        source: SourceFile = {
            "id": file_id,
            "name": safe_name,
            "originalName": original,
            "size": len(content),
            "mimeType": mime_type,
            "extension": extension,
            "sha256": sha256,
            "storedPath": str(stored_path),
            "createdAt": utc_now(),
            "confidence": "needs-ingest" if ingest.tier == 0 and extension else "uploaded",
            "ingestTier": ingest.tier,
            "previewAvailable": ingest.preview_available,
            "deepIngestAvailable": ingest.deep_ingest_available,
            "warnings": ingest.warnings,
        }
        if ingest.preview_text:
            source["previewText"] = ingest.preview_text
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO source_files(id, data) VALUES(?, ?)",
                (file_id, json.dumps(source)),
            )
        return source

    def upload_file_base64(self, name: str, content_base64: str, mime_type: str = "application/octet-stream") -> SourceFile:
        return self.upload_file(name, base64.b64decode(content_base64), mime_type)

    def create_run(
        self,
        request: str,
        engine: AgentEngine = "codex",
        cwd: str | None = None,
        source_file_ids: Iterable[str] = (),
        dry_run: bool = True,
    ) -> PanelRun:
        if not request.strip():
            raise ValueError("request required")
        run_id = f"run-{uuid.uuid4()}"
        run_dir = self.root / "runs" / run_id
        source_dir = run_dir / "sources"
        source_dir.mkdir(parents=True, exist_ok=True)
        files = [self.get_source_file(file_id) for file_id in source_file_ids]
        run_files: list[SourceFile] = []
        for source in files:
            destination = source_dir / source["name"]
            shutil.copyfile(source["storedPath"], destination)
            source = dict(source)
            source["storedPath"] = str(destination)
            run_files.append(source)
        now = utc_now()
        status: PanelRunStatus = "blocked" if dry_run else "queued"
        run: PanelRun = {
            "id": run_id,
            "title": _title(request),
            "request": request,
            "engine": engine,
            "status": status,
            "cwd": str(Path(cwd or self.project_root).resolve()),
            "sourceFiles": run_files,
            "stages": [
                {"id": "source-inventory", "label": "Source inventory", "owner": "local-agent-panel", "status": "ready", "output": "Files stored and hashed."},
                {"id": "preflight", "label": "Preflight", "owner": "local-agent-panel", "status": "drafted", "output": "Codex app-server, config, storage, and eventing checks."},
                {"id": "agent-execution", "label": "Agent execution", "owner": engine, "status": status, "output": "Codex app-server execution."},
                {"id": "stage-manifest", "label": "Stage manifest", "owner": "local-agent-panel", "status": "drafted", "output": "Durable run contract."},
            ],
            "packages": [],
            "skills": [],
            "outputs": [
                _output("transcript", "Transcript", str(run_dir / "transcript.txt"), "transcript", "drafted", "Captured stdout/stderr summary."),
                _output("manifest", "Stage manifest", str(run_dir / "stage_manifest.json"), "manifest", "drafted", "Source hashes, blockers, validation, and next-stage contract."),
                _output("diagnostics", "Diagnostics", str(run_dir / "diagnostics.json"), "manifest", "drafted", "Redacted capability, process, event, and artifact evidence."),
            ],
            "createdAt": now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute("INSERT INTO runs(id, data, status) VALUES(?, ?, ?)", (run_id, json.dumps(run), status))
        self.add_event(run_id, "run.created", "Run created", {"run": run})
        self.write_manifest(run_id, ["Dry run requested."] if dry_run else [])
        return run

    def get_run(self, run_id: str) -> PanelRun:
        with self._connect() as conn:
            row = conn.execute("SELECT data FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            raise KeyError(run_id)
        return json.loads(row[0])

    def set_run_status(self, run_id: str, status: PanelRunStatus, message: str | None = None) -> PanelRun:
        run = self.get_run(run_id)
        run["status"] = status
        run["updatedAt"] = utc_now()
        for stage in run["stages"]:
            if stage["id"] in {"preflight", "agent-execution", "stage-manifest"}:
                stage["status"] = status
                if message and stage["id"] == "agent-execution":
                    stage["output"] = message
        with self._connect() as conn:
            conn.execute("UPDATE runs SET data = ?, status = ? WHERE id = ?", (json.dumps(run), status, run_id))
        self.add_event(run_id, f"run.{status}", message or f"Run {status}")
        return run

    def get_source_file(self, file_id: str) -> SourceFile:
        with self._connect() as conn:
            row = conn.execute("SELECT data FROM source_files WHERE id = ?", (file_id,)).fetchone()
        if row is None:
            raise KeyError(file_id)
        return json.loads(row[0])

    def add_event(
        self,
        run_id: str,
        event_type: str,
        message: str,
        data: dict | None = None,
        *,
        thread_id: str | None = None,
        turn_id: str | None = None,
        raw_ref: str | None = None,
        source: str = "local_agent_panel",
    ) -> NormalizedEvent:
        event: NormalizedEvent = {
            "event_id": f"evt_{uuid.uuid4()}",
            "run_id": run_id,
            "thread_id": thread_id,
            "turn_id": turn_id,
            "type": event_type,
            "created_at": utc_now(),
            "source": source,
            "payload": data or {},
            "raw_ref": raw_ref,
            "message": message,
        }
        self.add_normalized_event(event)
        return event

    def add_normalized_event(self, event: NormalizedEvent) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO events(id, run_id, thread_id, turn_id, type, source, message, payload, raw_ref, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["event_id"],
                    event["run_id"],
                    event.get("thread_id"),
                    event.get("turn_id"),
                    event["type"],
                    event.get("source", "local_agent_panel"),
                    event.get("message", ""),
                    json.dumps(event.get("payload", {})),
                    event.get("raw_ref"),
                    event["created_at"],
                ),
            )
        self._append_jsonl(self.root / "runs" / event["run_id"] / "events.jsonl", event)

    def events(self, run_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, run_id, thread_id, turn_id, type, source, message, payload, raw_ref, created_at
                FROM events WHERE run_id = ? ORDER BY created_at
                """,
                (run_id,),
            ).fetchall()
        return [
            {
                "event_id": row[0],
                "id": row[0],
                "run_id": row[1],
                "runId": row[1],
                "thread_id": row[2],
                "threadId": row[2],
                "turn_id": row[3],
                "turnId": row[3],
                "type": row[4],
                "source": row[5],
                "message": row[6],
                "payload": json.loads(row[7]),
                "data": json.loads(row[7]),
                "raw_ref": row[8],
                "created_at": row[9],
                "createdAt": row[9],
            }
            for row in rows
        ]

    def append_raw(self, run_id: str, relative_path: str, line: str, redactor: Redactor | None = None) -> str:
        run_dir = self.root / "runs" / run_id
        path = run_dir / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        line_number = 1
        if path.exists():
            line_number = sum(1 for _ in path.open("r", encoding="utf-8", errors="replace")) + 1
        body = redactor.redact_json_line(line) if redactor else line
        with path.open("a", encoding="utf-8") as handle:
            handle.write(body.rstrip("\n") + "\n")
        if redactor:
            self.write_redaction_report(run_id, redactor.report.as_dict())
        return f"{path}#{line_number}"

    def record_process(self, run_id: str, pid: int, kind: str, argv: list[str]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO processes(run_id, pid, kind, argv, started_at, status) VALUES(?, ?, ?, ?, ?, ?)",
                (run_id, pid, kind, json.dumps(argv), utc_now(), "running"),
            )

    def finish_process(self, run_id: str, status: str, exit_code: int | None = None) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE processes SET status = ?, exit_code = ?, finished_at = ? WHERE run_id = ?",
                (status, exit_code, utc_now(), run_id),
            )

    def record_thread(self, run_id: str, thread_id: str, data: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO threads(id, run_id, data, created_at) VALUES(?, ?, ?, ?)",
                (thread_id, run_id, json.dumps(data), utc_now()),
            )

    def create_approval_from_event(self, event: NormalizedEvent) -> ApprovalRecord:
        payload = event.get("payload", {})
        approval_id = str(payload.get("requestId") or payload.get("itemId") or event["event_id"])
        kind = _approval_kind(event["type"])
        record: ApprovalRecord = {
            "id": approval_id,
            "runId": event["run_id"],
            "threadId": event.get("thread_id"),
            "turnId": event.get("turn_id"),
            "itemId": str(payload.get("itemId")) if payload.get("itemId") else None,
            "kind": kind,
            "status": "pending",
            "reason": str(payload.get("reason") or event.get("message") or "Approval requested"),
            "command": str(payload.get("command")) if payload.get("command") else None,
            "cwd": str(payload.get("cwd")) if payload.get("cwd") else None,
            "payload": payload,
            "createdAt": event["created_at"],
            "resolvedAt": None,
            "decision": None,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO approvals(id, run_id, thread_id, turn_id, item_id, kind, status, reason, command, cwd, payload, created_at, resolved_at, decision)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["runId"],
                    record.get("threadId"),
                    record.get("turnId"),
                    record.get("itemId"),
                    record["kind"],
                    record["status"],
                    record["reason"],
                    record.get("command"),
                    record.get("cwd"),
                    json.dumps(record.get("payload", {})),
                    record["createdAt"],
                    None,
                    None,
                ),
            )
        self._append_jsonl(self.root / "runs" / event["run_id"] / "approvals.jsonl", record)
        return record

    def resolve_approval(self, approval_id: str, decision: str) -> ApprovalRecord:
        now = utc_now()
        with self._connect() as conn:
            row = conn.execute("SELECT run_id, thread_id, turn_id, item_id, kind, reason, command, cwd, payload, created_at FROM approvals WHERE id = ?", (approval_id,)).fetchone()
            if row is None:
                raise KeyError(approval_id)
            status = "allowed" if decision.startswith("allow") else "denied" if decision == "deny" else "cancelled"
            conn.execute(
                "UPDATE approvals SET status = ?, resolved_at = ?, decision = ? WHERE id = ?",
                (status, now, decision, approval_id),
            )
        record: ApprovalRecord = {
            "id": approval_id,
            "runId": row[0],
            "threadId": row[1],
            "turnId": row[2],
            "itemId": row[3],
            "kind": row[4],
            "status": status,  # type: ignore[typeddict-item]
            "reason": row[5],
            "command": row[6],
            "cwd": row[7],
            "payload": json.loads(row[8]),
            "createdAt": row[9],
            "resolvedAt": now,
            "decision": decision,
        }
        self._append_jsonl(self.root / "runs" / row[0] / "approvals.jsonl", record)
        self.add_event(row[0], "approval.decided", f"Approval {decision}", {"approval": record})
        return record

    def approvals(self, run_id: str) -> list[ApprovalRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, run_id, thread_id, turn_id, item_id, kind, status, reason, command, cwd, payload, created_at, resolved_at, decision FROM approvals WHERE run_id = ? ORDER BY created_at",
                (run_id,),
            ).fetchall()
        return [
            {
                "id": row[0],
                "runId": row[1],
                "threadId": row[2],
                "turnId": row[3],
                "itemId": row[4],
                "kind": row[5],
                "status": row[6],
                "reason": row[7],
                "command": row[8],
                "cwd": row[9],
                "payload": json.loads(row[10]),
                "createdAt": row[11],
                "resolvedAt": row[12],
                "decision": row[13],
            }
            for row in rows
        ]

    def record_capability_report(self, report: dict[str, Any]) -> Path:
        run_id = f"preflight-{uuid.uuid4()}"
        run_dir = self.root / "runs" / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        path = run_dir / "capability_report.json"
        _atomic_json(path, report)
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO engine_detections(id, engine, status, data, created_at) VALUES(?, ?, ?, ?, ?)",
                (run_id, "codex", report.get("status", "unknown"), json.dumps(report), utc_now()),
            )
        return path

    def write_redaction_report(self, run_id: str, report: dict[str, Any]) -> Path:
        path = self.root / "runs" / run_id / "redaction-report.json"
        _atomic_json(path, report)
        return path

    def write_diagnostics(self, run_id: str, extra: dict[str, Any] | None = None) -> Path:
        run = self.get_run(run_id)
        data = {
            "run": run,
            "events": self.events(run_id),
            "approvals": self.approvals(run_id),
            "extra": extra or {},
            "generatedAt": utc_now(),
        }
        path = self.root / "runs" / run_id / "diagnostics.json"
        _atomic_json(path, data)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO diagnostic_bundles(run_id, path, created_at, data) VALUES(?, ?, ?, ?)",
                (run_id, str(path), utc_now(), json.dumps({"path": str(path)})),
            )
        return path

    def create_bundle(self, run_id: str) -> Path:
        import zipfile

        self.write_diagnostics(run_id)
        run_dir = self.root / "runs" / run_id
        bundle_path = run_dir / "diagnostics-bundle.zip"
        with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in run_dir.rglob("*"):
                if path.is_file() and path != bundle_path:
                    archive.write(path, path.relative_to(run_dir))
        return bundle_path

    def write_manifest(self, run_id: str, blockers: list[str]) -> StageManifest:
        run = self.get_run(run_id)
        manifest: StageManifest = {
            "schemaVersion": 1,
            "runId": run_id,
            "stageId": "agent-execution",
            "sourceFiles": run["sourceFiles"],
            "sourceHashes": {source["id"]: source["sha256"] for source in run["sourceFiles"]},
            "inputs": [run["request"]],
            "outputs": run["outputs"],
            "toolCalls": [],
            "blockers": blockers,
            "validation": [
                {
                    "id": "process-exit",
                    "status": "pass" if not blockers and run["status"] == "ready" else "blocked",
                    "message": "Process exited successfully and transcript was captured." if not blockers and run["status"] == "ready" else blockers[0] if blockers else "Run has not completed validation.",
                }
            ],
            "nextStageContract": "Downstream stages must inspect source hashes, transcript, blockers, and output paths before accepting this run.",
            "diagnosticsPath": str(self.root / "runs" / run_id / "diagnostics.json"),
            "redactionReportPath": str(self.root / "runs" / run_id / "redaction-report.json"),
        }
        path = self.root / "runs" / run_id / "stage_manifest.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{uuid.uuid4()}.tmp")
        tmp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        os.replace(tmp, path)
        return manifest

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _migrate(self) -> None:
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("CREATE TABLE IF NOT EXISTS schema_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS source_files(id TEXT PRIMARY KEY, data TEXT NOT NULL)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS events(
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    thread_id TEXT,
                    turn_id TEXT,
                    type TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'local_agent_panel',
                    message TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    raw_ref TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            columns = {row[1] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
            if "thread_id" not in columns:
                conn.execute("ALTER TABLE events ADD COLUMN thread_id TEXT")
            if "turn_id" not in columns:
                conn.execute("ALTER TABLE events ADD COLUMN turn_id TEXT")
            if "source" not in columns:
                conn.execute("ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT 'local_agent_panel'")
            if "payload" not in columns:
                conn.execute("ALTER TABLE events ADD COLUMN payload TEXT NOT NULL DEFAULT '{}'")
                conn.execute("UPDATE events SET payload = data WHERE data IS NOT NULL")
            if "raw_ref" not in columns:
                conn.execute("ALTER TABLE events ADD COLUMN raw_ref TEXT")
            conn.execute("CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS approvals(
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    thread_id TEXT,
                    turn_id TEXT,
                    item_id TEXT,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    command TEXT,
                    cwd TEXT,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    resolved_at TEXT,
                    decision TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS processes(
                    run_id TEXT PRIMARY KEY,
                    pid INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    argv TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    status TEXT NOT NULL,
                    exit_code INTEGER
                )
                """
            )
            conn.execute("CREATE TABLE IF NOT EXISTS engine_detections(id TEXT PRIMARY KEY, engine TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS config_snapshots(id TEXT PRIMARY KEY, run_id TEXT, data TEXT NOT NULL, created_at TEXT NOT NULL)")
            conn.execute("CREATE TABLE IF NOT EXISTS diagnostic_bundles(run_id TEXT PRIMARY KEY, path TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL)")
            conn.execute("INSERT OR REPLACE INTO schema_meta(key, value) VALUES('schema_version', '2')")

    def _append_jsonl(self, path: Path, value: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def _safe_name(name: str) -> str:
    return "".join(char if char.isalnum() or char in "._-" else "_" for char in name)[:140] or "upload.bin"


def _title(request: str) -> str:
    first = request.strip().splitlines()[0]
    return first[:67] + "..." if len(first) > 70 else first


def _output(
    output_id: str,
    label: str,
    path: str,
    output_type: str,
    status: PanelRunStatus,
    description: str,
) -> PipelineOutput:
    return {"id": output_id, "label": label, "path": path, "type": output_type, "status": status, "description": description}  # type: ignore[return-value]


def _approval_kind(event_type: str) -> str:
    if "command" in event_type:
        return "command"
    if "file_change" in event_type:
        return "file_change"
    if "network" in event_type:
        return "network"
    if "tool" in event_type:
        return "tool"
    return "unknown"


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{uuid.uuid4()}.tmp")
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)
