from fastapi.testclient import TestClient

from solar_race_planner import __version__
from solar_race_planner.serve.app import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}
