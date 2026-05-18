from cumuluse_backend import AgentPanelStore, doctor_sync
from cumuluse_backend.cli import main


def test_cumuluse_backend_namespace_exports() -> None:
    assert AgentPanelStore is not None
    assert doctor_sync is not None
    assert main is not None
