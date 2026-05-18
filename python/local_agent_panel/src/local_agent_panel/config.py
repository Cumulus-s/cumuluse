from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class AgentPanelConfig:
    project_root: Path
    storage_root: Path
    default_engine: str = "codex"
    host: str = "127.0.0.1"
    port: int = 8792
    raw_diagnostics: bool = True
    retain_unredacted_raw: bool = False

    @classmethod
    def load(cls, project: str | Path | None = None, storage_root: str | Path | None = None) -> "AgentPanelConfig":
        project_root = Path(project or ".").expanduser().resolve()
        root = Path(storage_root).expanduser().resolve() if storage_root else project_root / ".cumuluse" / "backend"
        config_path = project_root / ".cumuluse" / "config.toml"
        if not config_path.exists():
            config_path = root / "config.toml"
        data: dict[str, Any] = {}
        if config_path.exists():
            data = tomllib.loads(config_path.read_text(encoding="utf-8"))
        server = data.get("server", {}) if isinstance(data.get("server", {}), dict) else {}
        diagnostics = data.get("diagnostics", {}) if isinstance(data.get("diagnostics", {}), dict) else {}
        return cls(
            project_root=project_root,
            storage_root=root,
            default_engine=str(data.get("default_engine", "codex")),
            host=str(server.get("host", "127.0.0.1")),
            port=int(server.get("port", 8792)),
            raw_diagnostics=bool(diagnostics.get("raw", True)),
            retain_unredacted_raw=bool(diagnostics.get("retain_unredacted_raw", False)),
        )

    def ensure_written(self) -> Path:
        self.storage_root.mkdir(parents=True, exist_ok=True)
        project_config = self.project_root / ".cumuluse" / "config.toml"
        path = project_config if self.storage_root == self.project_root / ".cumuluse" / "backend" else self.storage_root / "config.toml"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(
                "\n".join(
                    [
                        'name = "cumuluse"',
                        'default_engine = "codex"',
                        f"project_root = {str(self.project_root)!r}",
                        "",
                        "[server]",
                        'host = "127.0.0.1"',
                        "port = 8792",
                        "",
                        "[diagnostics]",
                        "raw = true",
                        "retain_unredacted_raw = false",
                        "",
                        "[safety]",
                        "local_only = true",
                        "allow_remote = false",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
        return path
