import importlib

from fastapi.testclient import TestClient

from solar_race_planner import __version__
from solar_race_planner.serve import app as app_module

client = TestClient(app_module.app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_cors_origins_ignore_spaces_and_trailing_slashes(monkeypatch):
    monkeypatch.setenv("SRP_CORS_ORIGINS", "https://web.example.test/, http://localhost:5173")
    module = importlib.reload(app_module)
    try:
        cors_client = TestClient(module.app)
        for origin in ["https://web.example.test", "http://localhost:5173"]:
            response = cors_client.get("/health", headers={"Origin": origin})
            assert response.headers["access-control-allow-origin"] == origin
    finally:
        monkeypatch.delenv("SRP_CORS_ORIGINS")
        importlib.reload(app_module)
