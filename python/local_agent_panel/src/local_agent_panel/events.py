from __future__ import annotations

import json
import uuid
from typing import Any

from .contracts import NormalizedEvent
from .timeutil import utc_now


def normalize_app_server_message(
    message: dict[str, Any],
    run_id: str,
    raw_ref: str | None = None,
) -> NormalizedEvent:
    method = str(message.get("method") or "")
    params = dict(message.get("params")) if isinstance(message.get("params"), dict) else {}
    if "id" in message:
        params["requestId"] = message["id"]
        params["requestMethod"] = method
    thread_id = _find_key(params, "threadId") or _find_key(params, "thread_id")
    turn_id = _find_key(params, "turnId") or _find_key(params, "turn_id")
    event_type = _event_type(method, params)
    return {
        "event_id": f"evt_{uuid.uuid4()}",
        "run_id": run_id,
        "thread_id": str(thread_id) if thread_id else None,
        "turn_id": str(turn_id) if turn_id else None,
        "type": event_type,
        "created_at": utc_now(),
        "source": "codex.app_server",
        "payload": params,
        "raw_ref": raw_ref,
        "message": _message_for(method, params),
    }


def normalize_exec_json_line(line: str, run_id: str, raw_ref: str | None = None) -> NormalizedEvent:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        payload = {"text": line}
    raw_type = str(payload.get("type") or "output")
    return {
        "event_id": f"evt_{uuid.uuid4()}",
        "run_id": run_id,
        "thread_id": payload.get("thread_id"),
        "turn_id": payload.get("turn_id"),
        "type": f"codex.exec.{raw_type}",
        "created_at": utc_now(),
        "source": "codex.exec",
        "payload": payload,
        "raw_ref": raw_ref,
        "message": raw_type,
    }


def is_approval_event(event: NormalizedEvent) -> bool:
    return event["type"] in {
        "approval.command.requested",
        "approval.file_change.requested",
        "approval.tool.requested",
        "approval.network.requested",
    }


def _event_type(method: str, params: dict[str, Any]) -> str:
    if method == "item/commandExecution/requestApproval":
        return "approval.network.requested" if params.get("networkApprovalContext") else "approval.command.requested"
    if method == "item/fileChange/requestApproval":
        return "approval.file_change.requested"
    if method in {"tool/requestUserInput", "item/tool/requestUserInput"}:
        return "approval.tool.requested"
    if method == "serverRequest/resolved":
        return "approval.resolved"
    if method == "turn/started":
        return "turn.started"
    if method == "turn/completed":
        status = _find_key(params, "status")
        if status == "interrupted":
            return "turn.interrupted"
        if status == "failed":
            return "turn.failed"
        return "turn.completed"
    if method == "item/agentMessage/delta":
        return "message.delta"
    if method == "item/started":
        return "item.started"
    if method == "item/completed":
        item_type = _find_key(params, "type") or "item"
        return f"item.{item_type}.completed"
    if method == "thread/status/changed":
        return "thread.status.changed"
    if method.startswith("thread/"):
        return method.replace("/", ".")
    if method.startswith("item/"):
        return method.replace("/", ".")
    return method.replace("/", ".") if method else "unknown"


def _message_for(method: str, params: dict[str, Any]) -> str:
    if method.endswith("requestApproval"):
        return str(params.get("reason") or "Approval requested")
    if method == "item/agentMessage/delta":
        return str(params.get("delta") or params.get("text") or "")
    if method == "turn/completed":
        return "Turn completed"
    return method or "event"


def _find_key(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        if key in value:
            return value[key]
        for child in value.values():
            found = _find_key(child, key)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_key(child, key)
            if found is not None:
                return found
    return None
