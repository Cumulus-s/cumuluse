from local_agent_panel.redaction import Redactor


def test_redacts_secret_fields_and_values() -> None:
    redactor = Redactor()
    result = redactor.redact(
        {
            "api_key": "secret",
            "message": "use bearer abcdefghijklmnopqrstuvwxyz",
            "nested": {"token": "hidden"},
        }
    )

    assert result["api_key"] == "[REDACTED]"
    assert result["nested"]["token"] == "[REDACTED]"
    assert "[REDACTED]" in result["message"]
    assert redactor.report.fields_redacted == 2
    assert redactor.report.values_redacted == 1
