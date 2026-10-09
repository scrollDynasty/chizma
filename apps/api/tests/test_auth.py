from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from chizma_api.auth.providers import OAuthProfile
from tests.conftest import FakeGateway


def sign_in(client: TestClient, provider: str = "github") -> dict[str, str]:
    """Run callback + exchange; return the query params the editor received."""
    response = client.get(f"/v1/auth/{provider}/callback", follow_redirects=False)
    assert response.status_code == 302
    location = urlparse(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == (
        "https://web.example/chizma/auth/callback"
    )
    return {key: values[0] for key, values in parse_qs(location.query).items()}


def exchange(client: TestClient, code: str) -> dict[str, object]:
    response = client.post("/v1/auth/exchange", json={"code": code})
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


def test_lists_configured_providers(client: TestClient) -> None:
    assert client.get("/v1/auth/providers").json() == {"providers": ["github", "google"]}


def test_production_with_weak_secret_disables_sign_in(
    client_factory: Callable[..., TestClient],
) -> None:
    client = client_factory(env="production", jwt_secret="short")

    assert client.get("/v1/auth/providers").json() == {"providers": []}
    assert client.get("/v1/auth/github/login", follow_redirects=False).status_code == 404


def test_login_redirects_to_provider_with_api_callback(client: TestClient) -> None:
    response = client.get("/v1/auth/github/login", follow_redirects=False)

    assert response.status_code == 307
    assert (
        "redirect_uri=https://api.example/v1/auth/github/callback" in response.headers["location"]
    )


def test_unknown_provider_is_404(client: TestClient) -> None:
    assert client.get("/v1/auth/facebook/login", follow_redirects=False).status_code == 404


def test_full_sign_in_returns_token_and_profile(client: TestClient) -> None:
    params = sign_in(client)
    body = exchange(client, params["code"])

    me = client.get("/v1/me", headers={"Authorization": f"Bearer {body['access_token']}"})

    assert me.status_code == 200
    assert me.json() == {
        "id": 1,
        "provider": "github",
        "login": "Octocat",
        "name": "The Octocat",
        "avatar_url": "https://a.example/o.png",
    }


def test_login_code_is_single_use(client: TestClient) -> None:
    code = sign_in(client)["code"]
    exchange(client, code)

    again = client.post("/v1/auth/exchange", json={"code": code})

    assert again.status_code == 400
    assert again.json()["detail"] == "invalid_code"


def test_signing_in_twice_updates_profile_without_duplicates(
    client: TestClient, gateway: FakeGateway
) -> None:
    exchange(client, sign_in(client)["code"])
    gateway.profile = OAuthProfile("github", "583231", "octocat", "Renamed", None)

    body = exchange(client, sign_in(client)["code"])

    assert body["user"] == {
        "id": 1,
        "provider": "github",
        "login": "octocat",
        "name": "Renamed",
        "avatar_url": None,
    }


def test_provider_failure_returns_error_to_editor(client: TestClient, gateway: FakeGateway) -> None:
    gateway.fail = True

    assert sign_in(client) == {"error": "oauth_failed"}


def test_allow_list_blocks_unknown_users(
    client_factory: Callable[..., TestClient], gateway: FakeGateway
) -> None:
    client = client_factory(allowed_users="github:someone-else,google:42")

    assert sign_in(client) == {"error": "not_allowed"}


def test_allow_list_matches_github_login_case_insensitively(
    client_factory: Callable[..., TestClient],
) -> None:
    client = client_factory(allowed_users="github:OCTOCAT")

    assert "code" in sign_in(client)


def test_allow_list_matches_google_subject(
    client_factory: Callable[..., TestClient], gateway: FakeGateway
) -> None:
    gateway.profile = OAuthProfile("google", "1029384756", None, "Aziza", None)
    client = client_factory(allowed_users="google:1029384756")

    assert "code" in sign_in(client, "google")


def test_me_requires_a_valid_token(client: TestClient) -> None:
    assert client.get("/v1/me").status_code == 401
    bad = client.get("/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert bad.status_code == 401
    assert bad.headers["www-authenticate"] == "Bearer"


def test_token_signed_with_another_secret_is_rejected(
    client_factory: Callable[..., TestClient], client: TestClient
) -> None:
    token = exchange(client, sign_in(client)["code"])["access_token"]
    other = client_factory(jwt_secret="another-secret-that-is-long-enough-for-hs256-x")

    assert other.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_test_login_only_exists_in_test_env(client_factory: Callable[..., TestClient]) -> None:
    dev = client_factory()
    assert dev.post("/v1/auth/test-login", json={"login": "e2e"}).status_code == 404

    test_env = client_factory(env="test")
    response = test_env.post("/v1/auth/test-login", json={"login": "e2e"})
    assert response.status_code == 200
    assert response.json()["user"]["provider"] == "test"
