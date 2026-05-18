from __future__ import annotations

import asyncio
import json
import os
import signal
from pathlib import Path
from typing import Any, AsyncIterator

from .events import normalize_app_server_message
from .redaction import Redactor
from .storage import AgentPanelStore


class CodexAppServerError(RuntimeError):
    pass


class CodexAppServerAdapter:
    def __init__(
        self,
        store: AgentPanelStore,
        run_id: str,
        command: list[str] | None = None,
        cwd: str | Path | None = None,
    ) -> None:
        self.store = store
        self.run_id = run_id
        self.command = command or ["codex", "app-server"]
        self.cwd = str(Path(cwd or store.project_root).resolve())
        self.process: asyncio.subprocess.Process | None = None
        self._next_id = 1
        self._pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._reader_task: asyncio.Task[None] | None = None
        self._event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._redactor = Redactor()

    async def start(self) -> None:
        self.process = await asyncio.create_subprocess_exec(
            *self.command,
            cwd=self.cwd,
            env=_safe_env(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        self.store.record_process(self.run_id, self.process.pid or -1, "codex.app_server", self.command)
        self._reader_task = asyncio.create_task(self._read_stdout())
        asyncio.create_task(self._read_stderr())

    async def initialize(self) -> dict[str, Any]:
        result = await self.request(
            "initialize",
            {
                "clientInfo": {
                    "name": "local-agent-panel",
                    "title": "Local Agent Panel",
                    "version": "0.1.0",
                },
                "capabilities": {"experimentalApi": True},
            },
        )
        await self.notify("initialized", {})
        return result

    async def config_read(self) -> dict[str, Any] | None:
        try:
            result = await self.request("config/read", {"includeLayers": False})
            return result.get("config") if isinstance(result, dict) else result
        except CodexAppServerError as exc:
            self.store.add_event(self.run_id, "codex.config.failed", str(exc), source="codex.app_server")
            return None

    async def config_requirements_read(self) -> dict[str, Any] | None:
        try:
            result = await self.request("configRequirements/read", {})
            return result.get("requirements") if isinstance(result, dict) else result
        except CodexAppServerError as exc:
            self.store.add_event(self.run_id, "codex.requirements.failed", str(exc), source="codex.app_server")
            return None

    async def start_thread(self, cwd: str, model: str | None = None) -> str:
        params: dict[str, Any] = {"cwd": cwd, "serviceName": "local-agent-panel"}
        if model:
            params["model"] = model
        result = await self.request("thread/start", params)
        thread = result.get("thread") if isinstance(result, dict) else None
        thread_id = thread.get("id") if isinstance(thread, dict) else None
        if not thread_id:
            raise CodexAppServerError("thread/start did not return thread.id")
        self.store.record_thread(self.run_id, thread_id, thread)
        return str(thread_id)

    async def start_turn(self, thread_id: str, prompt: str, cwd: str, files: list[dict[str, Any]] | None = None) -> str:
        prompt_with_files = prompt
        if files:
            file_lines = "\n".join(
                f"- {file.get('originalName')}: {file.get('storedPath')} sha256={file.get('sha256')}"
                for file in files
            )
            prompt_with_files = f"{prompt}\n\nAttached local source files:\n{file_lines}"
        result = await self.request(
            "turn/start",
            {
                "threadId": thread_id,
                "cwd": cwd,
                "input": [{"type": "text", "text": prompt_with_files}],
            },
        )
        turn = result.get("turn") if isinstance(result, dict) else None
        turn_id = turn.get("id") if isinstance(turn, dict) else None
        if not turn_id:
            raise CodexAppServerError("turn/start did not return turn.id")
        return str(turn_id)

    async def interrupt_turn(self, thread_id: str, turn_id: str) -> None:
        await self.request("turn/interrupt", {"threadId": thread_id, "turnId": turn_id})

    async def respond_to_approval(self, approval: dict[str, Any], decision: str) -> None:
        request_id = approval.get("requestId")
        if request_id is None:
            raise CodexAppServerError("approval payload is missing requestId")
        self._write_json({"id": request_id, "result": _codex_approval_decision(decision)})

    async def request(self, method: str, params: dict[str, Any] | None = None, timeout: float = 20) -> dict[str, Any]:
        if not self.process or not self.process.stdin:
            raise CodexAppServerError("app-server process is not running")
        request_id = self._next_id
        self._next_id += 1
        message = {"method": method, "id": request_id, "params": params or {}}
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        self._write_json(message)
        return await asyncio.wait_for(future, timeout=timeout)

    async def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        self._write_json({"method": method, "params": params or {}})

    async def events(self) -> AsyncIterator[dict[str, Any]]:
        while True:
            event = await self._event_queue.get()
            yield event

    async def close(self) -> None:
        if self._reader_task:
            self._reader_task.cancel()
        if self.process and self.process.returncode is None:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)  # type: ignore[arg-type]
            except Exception:
                self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5)
            except asyncio.TimeoutError:
                self.process.kill()

    def _write_json(self, message: dict[str, Any]) -> None:
        assert self.process is not None and self.process.stdin is not None
        raw = json.dumps(message, separators=(",", ":"))
        self.store.append_raw(self.run_id, "codex.raw.jsonl", raw, self._redactor)
        self.process.stdin.write((raw + "\n").encode("utf-8"))

    async def _read_stdout(self) -> None:
        assert self.process is not None and self.process.stdout is not None
        while True:
            line = await self.process.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            raw_ref = self.store.append_raw(self.run_id, "codex.raw.jsonl", text, self._redactor)
            try:
                message = json.loads(text)
            except json.JSONDecodeError as exc:
                self.store.add_event(self.run_id, "codex.raw.malformed", str(exc), {"line": text}, raw_ref=raw_ref, source="codex.app_server")
                continue
            if "id" in message and ("result" in message or "error" in message):
                self._handle_response(message)
            elif "method" in message:
                event = normalize_app_server_message(message, self.run_id, raw_ref)
                self.store.add_normalized_event(event)
                if event["type"].startswith("approval."):
                    self.store.create_approval_from_event(event)
                    self.store.set_run_status(self.run_id, "waiting_for_approval", event.get("message"))
                await self._event_queue.put(event)

    async def _read_stderr(self) -> None:
        assert self.process is not None and self.process.stderr is not None
        while True:
            line = await self.process.stderr.readline()
            if not line:
                break
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            self.store.append_raw(self.run_id, "stderr.redacted.log", text, self._redactor)

    def _handle_response(self, message: dict[str, Any]) -> None:
        request_id = int(message["id"])
        future = self._pending.pop(request_id, None)
        if not future:
            return
        if "error" in message:
            error = message["error"]
            text = error.get("message") if isinstance(error, dict) else str(error)
            future.set_exception(CodexAppServerError(text))
        else:
            future.set_result(message.get("result") or {})


def _safe_env() -> dict[str, str]:
    allowed = {"PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM", "CODEX_HOME"}
    return {key: value for key, value in os.environ.items() if key in allowed}


def _codex_approval_decision(decision: str) -> str:
    if decision == "allow_once":
        return "accept"
    if decision == "allow_session":
        return "acceptForSession"
    if decision == "deny":
        return "decline"
    if decision == "cancel":
        return "cancel"
    raise CodexAppServerError(f"unsupported approval decision: {decision}")
