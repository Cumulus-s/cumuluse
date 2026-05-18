from __future__ import annotations

import shutil
import subprocess
from typing import Sequence

from .contracts import AgentEngine, CliDetection


def detect_cli(engine: AgentEngine) -> CliDetection:
    if engine == "claude":
        return _detect_claude()
    return _detect_codex()


def _detect_codex() -> CliDetection:
    path = shutil.which("codex")
    result = _run(["codex", "exec", "--help"])
    help_text = _trim(result.stdout + result.stderr)
    app_server = _run(["codex", "app-server", "--help"])
    app_server_text = _trim(app_server.stdout + app_server.stderr)
    ok = path is not None and result.returncode == 0
    app_server_ok = path is not None and app_server.returncode == 0
    return {
        "engine": "codex",
        "executablePath": path,
        "available": ok,
        "supportsNonInteractive": ok,
        "supportsJsonStream": "json" in help_text.lower() or "stream" in help_text.lower(),
        "supportsMcpConfig": "mcp-config" in help_text,
        "detectedCommand": ["codex", "exec"],
        "helpText": help_text,
        "error": None if ok else help_text or "codex exec --help failed",
        "supportsAppServer": app_server_ok,
        "appServerError": None if app_server_ok else app_server_text or "codex app-server --help failed",
    }


def _detect_claude() -> CliDetection:
    path = shutil.which("claude")
    result = _run(["claude", "--help"])
    help_text = _trim(result.stdout + result.stderr)
    ok = path is not None and result.returncode == 0
    return {
        "engine": "claude",
        "executablePath": path,
        "available": ok,
        "supportsNonInteractive": ok and "--print" in help_text,
        "supportsJsonStream": ok and "stream-json" in help_text,
        "supportsMcpConfig": ok and "--mcp-config" in help_text,
        "detectedCommand": ["claude", "-p"],
        "helpText": help_text,
        "error": None if ok else help_text or "claude --help failed",
        "supportsAppServer": False,
        "appServerError": "Claude is not a Codex app-server engine.",
    }


def command_for_prompt(engine: AgentEngine, prompt: str, session_id: str) -> list[str]:
    if engine == "claude":
        return [
            "claude",
            "-p",
            prompt,
            "--output-format",
            "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--session-id",
            session_id,
        ]
    return ["codex", "exec", "--json", prompt]


def _run(argv: Sequence[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(argv, text=True, capture_output=True, timeout=5, check=False)
    except FileNotFoundError as exc:
        return subprocess.CompletedProcess(list(argv), 127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        return subprocess.CompletedProcess(list(argv), 124, exc.stdout or "", exc.stderr or "timeout")


def _trim(text: str, limit: int = 8000) -> str:
    return text.strip()[:limit]
