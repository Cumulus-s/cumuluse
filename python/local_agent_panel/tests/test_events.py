from local_agent_panel.events import normalize_app_server_message


def test_normalizes_approval_event() -> None:
    event = normalize_app_server_message(
        {
            "method": "item/commandExecution/requestApproval",
            "id": "approval-1",
            "params": {
                "threadId": "thread-1",
                "turnId": "turn-1",
                "itemId": "item-1",
                "command": "python test.py",
                "reason": "Needs to run a command",
            },
        },
        "run-1",
        "raw#1",
    )

    assert event["type"] == "approval.command.requested"
    assert event["thread_id"] == "thread-1"
    assert event["turn_id"] == "turn-1"
    assert event["raw_ref"] == "raw#1"
    assert event["payload"]["requestId"] == "approval-1"


def test_normalizes_turn_completed() -> None:
    event = normalize_app_server_message(
        {"method": "turn/completed", "params": {"turn": {"id": "turn-1"}, "status": "completed"}},
        "run-1",
    )

    assert event["type"] == "turn.completed"
