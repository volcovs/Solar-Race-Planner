from fastapi.testclient import TestClient

from solar_race_planner.serve.app import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_health_reports_deployed_commit(monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "abc123")
    assert client.get("/health").json()["commit"] == "abc123"
