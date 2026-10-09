from collections.abc import Callable

from fastapi.testclient import TestClient


def test_health_reports_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_cors_allows_configured_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://web.example"})

    assert response.headers["access-control-allow-origin"] == "https://web.example"


def test_cors_rejects_unknown_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers


def test_docs_hidden_in_production(client_factory: Callable[..., TestClient]) -> None:
    client = client_factory(env="production")

    assert client.get("/docs").status_code == 404
