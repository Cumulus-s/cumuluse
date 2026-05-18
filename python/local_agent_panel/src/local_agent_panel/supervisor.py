from __future__ import annotations

import os
import signal
import asyncio
import subprocess
import threading
import uuid
from pathlib import Path

from .adapters import command_for_prompt, detect_cli
from .codex_app_server import CodexAppServerAdapter
from .contracts import AgentEngine
from .events import normalize_exec_json_line
from .redaction import Redactor
from .storage import AgentPanelStore


class RunSupervisor:
    def __init__(self, store: AgentPanelStore) -> None:
        self.store = store
        self._processes: dict[str, subprocess.Popen[str]] = {}
        self._adapters: dict[str, CodexAppServerAdapter] = {}
        self._loops: dict[str, asyncio.AbstractEventLoop] = {}

    def start(self, run_id: str) -> None:
        run = self.store.get_run(run_id)
        engine: AgentEngine = run["engine"]  # type: ignore[assignment]
        detection = detect_cli(engine)
        self.store.set_run_status(run_id, "preflighting", "Checking local Codex capabilities.")
        if engine != "codex":
            self.store.set_run_status(run_id, "blocked", "Claude is future adapter work. v1 execution is Codex-first.")
            self.store.write_manifest(run_id, ["Claude is future adapter work. v1 execution is Codex-first."])
            return
        if detection.get("supportsAppServer"):
            threading.Thread(target=lambda: asyncio.run(self._start_app_server(run_id)), daemon=True).start()
            return
        if detection.get("supportsNonInteractive"):
            self.store.add_event(run_id, "run.degraded", "Codex app-server unavailable; falling back to codex exec --json.", detection, source="local_agent_panel")
            self._start_exec_fallback(run_id, detection)
            return
        blocker = detection.get("appServerError") or detection.get("error") or "Codex app-server and exec are unavailable."
        self.store.set_run_status(run_id, "blocked", blocker)
        self.store.write_manifest(run_id, [blocker])

    async def _start_app_server(self, run_id: str) -> None:
        run = self.store.get_run(run_id)
        adapter = CodexAppServerAdapter(self.store, run_id, cwd=run["cwd"])
        self._adapters[run_id] = adapter
        self._loops[run_id] = asyncio.get_running_loop()
        try:
            self.store.set_run_status(run_id, "preflighting", "Starting Codex app-server.")
            await adapter.start()
            await adapter.initialize()
            config = await adapter.config_read()
            requirements = await adapter.config_requirements_read()
            self.store.add_event(run_id, "codex.config.resolved", "Resolved effective Codex config.", {"config": config, "requirements": requirements}, source="codex.app_server")
            thread_id = await adapter.start_thread(run["cwd"])
            turn_id = await adapter.start_turn(thread_id, run["request"], run["cwd"], run.get("sourceFiles", []))
            self.store.set_run_status(run_id, "running", "Codex app-server turn started.")

            async for event in adapter.events():
                if event["type"] == "turn.completed":
                    self.store.set_run_status(run_id, "ready", "Codex turn completed.")
                    self.store.write_manifest(run_id, [])
                    self.store.write_diagnostics(run_id, {"effectiveConfig": config, "configRequirements": requirements})
                    break
                if event["type"] == "turn.failed":
                    self.store.set_run_status(run_id, "failed", "Codex turn failed.")
                    self.store.write_manifest(run_id, ["Codex turn failed."])
                    self.store.write_diagnostics(run_id)
                    break
                if event["type"] == "turn.interrupted":
                    self.store.set_run_status(run_id, "interrupted", "Codex turn interrupted.")
                    self.store.write_manifest(run_id, ["Codex turn interrupted."])
                    self.store.write_diagnostics(run_id)
                    break
        except Exception as exc:
            self.store.set_run_status(run_id, "failed", str(exc))
            self.store.write_manifest(run_id, [str(exc)])
            self.store.write_diagnostics(run_id)
        finally:
            self._adapters.pop(run_id, None)
            self._loops.pop(run_id, None)
            await adapter.close()

    def approve(self, approval_id: str, decision: str) -> dict:
        record = self.store.resolve_approval(approval_id, decision)
        run_id = record["runId"]
        adapter = self._adapters.get(run_id)
        loop = self._loops.get(run_id)
        if adapter and loop:
            future = asyncio.run_coroutine_threadsafe(adapter.respond_to_approval(record.get("payload", {}), decision), loop)
            try:
                future.result(timeout=10)
                self.store.add_event(run_id, "approval.sent", f"Approval {decision} sent to Codex.", {"approvalId": approval_id})
                if self.store.get_run(run_id)["status"] == "waiting_for_approval":
                    self.store.set_run_status(run_id, "running", "Approval decision sent to Codex.")
            except Exception as exc:
                self.store.add_event(run_id, "approval.send_failed", str(exc), {"approvalId": approval_id})
        return record

    def _start_exec_fallback(self, run_id: str, detection: dict) -> None:
        run = self.store.get_run(run_id)
        engine: AgentEngine = run["engine"]  # type: ignore[assignment]
        prompt = _prompt_for_run(run)
        argv = command_for_prompt(engine, prompt, str(uuid.uuid4()))
        self.store.set_run_status(run_id, "running", f"Started {engine}.")
        transcript_path = Path(run["outputs"][0]["path"])
        transcript_path.parent.mkdir(parents=True, exist_ok=True)
        transcript = transcript_path.open("w", encoding="utf-8")
        process = subprocess.Popen(
            argv,
            cwd=run["cwd"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
            env=_safe_env(),
        )
        self._processes[run_id] = process
        self.store.record_process(run_id, process.pid or -1, "codex.exec", argv)

        def pump() -> None:
            assert process.stdout is not None
            redactor = Redactor()
            with transcript:
                for line in process.stdout:
                    transcript.write(line)
                    transcript.flush()
                    raw_ref = self.store.append_raw(run_id, "codex.exec.raw.jsonl", line.rstrip("\n"), redactor)
                    self.store.add_normalized_event(normalize_exec_json_line(line, run_id, raw_ref))
            code = process.wait()
            self._processes.pop(run_id, None)
            self.store.finish_process(run_id, "exited", code)
            if self.store.get_run(run_id)["status"] == "cancelled":
                return
            if code == 0:
                self.store.set_run_status(run_id, "ready", "Process exited 0 and transcript was captured.")
                self.store.write_manifest(run_id, [])
                self.store.write_diagnostics(run_id)
            else:
                message = f"exit_code={code}"
                self.store.set_run_status(run_id, "failed", message)
                self.store.write_manifest(run_id, [message])
                self.store.write_diagnostics(run_id)

        threading.Thread(target=pump, daemon=True).start()

    def stop(self, run_id: str) -> None:
        process = self._processes.get(run_id)
        if process and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        self.store.set_run_status(run_id, "cancelled", "Run cancelled by user.")
        self.store.write_manifest(run_id, ["Run cancelled by user."])


def _prompt_for_run(run: dict) -> str:
    files = "\n".join(
        f"- {source['originalName']}: {source['storedPath']} sha256={source['sha256']}"
        for source in run.get("sourceFiles", [])
    )
    return f"{run['request']}\n\nAttached local source files:\n{files or '(none)'}"


def _safe_env() -> dict[str, str]:
    allowed = {"PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM", "CLAUDE_CONFIG_DIR", "CODEX_HOME"}
    return {key: value for key, value in os.environ.items() if key in allowed}
