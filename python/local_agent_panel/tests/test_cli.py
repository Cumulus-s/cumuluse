from local_agent_panel.cli import main


def test_doctor_command_prints_json(tmp_path, capsys) -> None:
    code = main(["--storage-root", str(tmp_path), "doctor"])
    captured = capsys.readouterr()

    assert code == 0
    assert '"codex"' in captured.out
    assert '"artifactVault"' in captured.out
