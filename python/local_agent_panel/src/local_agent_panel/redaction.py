from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any


SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|access[_-]?token|auth|authorization|bearer|client[_-]?secret|cookie|oauth|password|refresh[_-]?token|secret|session|token)",
    re.IGNORECASE,
)
SECRET_VALUE_RE = re.compile(
    r"(?i)(sk-[a-z0-9_-]{12,}|xox[baprs]-[a-z0-9-]{10,}|gh[pousr]_[a-z0-9_]{20,}|bearer\s+[a-z0-9._-]{16,})"
)


@dataclass
class RedactionReport:
    fields_redacted: int = 0
    values_redacted: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "fieldsRedacted": self.fields_redacted,
            "valuesRedacted": self.values_redacted,
            "notes": self.notes,
        }


class Redactor:
    def __init__(self) -> None:
        self.report = RedactionReport()

    def redact(self, value: Any) -> Any:
        if isinstance(value, Mapping):
            out: dict[str, Any] = {}
            for key, child in value.items():
                key_text = str(key)
                if SECRET_KEY_RE.search(key_text):
                    out[key_text] = "[REDACTED]"
                    self.report.fields_redacted += 1
                else:
                    out[key_text] = self.redact(child)
            return out
        if isinstance(value, str):
            redacted, count = SECRET_VALUE_RE.subn("[REDACTED]", value)
            self.report.values_redacted += count
            return redacted
        if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            return [self.redact(item) for item in value]
        return value

    def redact_json_line(self, line: str) -> str:
        try:
            return json.dumps(self.redact(json.loads(line)), separators=(",", ":"))
        except json.JSONDecodeError:
            return self.redact(line)
