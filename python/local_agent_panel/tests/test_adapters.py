from local_agent_panel.adapters import detect_cli


def test_detect_cli_shape() -> None:
    codex = detect_cli("codex")
    claude = detect_cli("claude")

    assert codex["engine"] == "codex"
    assert claude["engine"] == "claude"
    assert "available" in codex
    assert "supportsNonInteractive" in claude
    assert "PATH=" not in (codex.get("error") or "")
