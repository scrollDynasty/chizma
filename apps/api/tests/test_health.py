from fastapi.testclient import TestClient

from chizma_api.config import Settings
from chizma_api.main import create_app


def make_client(cors_origins: str = "http://localhost:5173") -> TestClient:
    settings = Settings(_env_file=None, cors_origins=cors_origins)
    return TestClient(create_app(settings))


def test_health_reports_ok() -> None:
    response = make_client().get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_cors_allows_configured_origin() -> None:
    client = make_client(cors_origins="https://scrolldynasty.github.io/")

    response = client.get("/health", headers={"Origin": "https://scrolldynasty.github.io"})

    assert response.headers["access-control-allow-origin"] == "https://scrolldynasty.github.io"


def test_cors_rejects_unknown_origin() -> None:
    client = make_client(cors_origins="https://scrolldynasty.github.io")

    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers
