from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.responses import RedirectResponse, Response

import chizma_api.models  # noqa: F401  (registers tables)
from chizma_api.auth.providers import OAuthFailedError, OAuthProfile
from chizma_api.config import Settings
from chizma_api.db import Base
from chizma_api.main import create_app

TEST_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"

GITHUB_PROFILE = OAuthProfile(
    "github", "583231", "Octocat", "The Octocat", "https://a.example/o.png"
)


class FakeGateway:
    """Stands in for GitHub/Google: no network, profile chosen by the test."""

    def __init__(self) -> None:
        self.profile: OAuthProfile = GITHUB_PROFILE
        self.fail = False

    def providers(self) -> list[str]:
        return ["github", "google"]

    async def redirect(self, request: Request, provider: str, redirect_uri: str) -> Response:
        return RedirectResponse(f"https://{provider}.example/authorize?redirect_uri={redirect_uri}")

    async def fetch_profile(self, request: Request, provider: str) -> OAuthProfile:
        if self.fail:
            raise OAuthFailedError("denied")
        return self.profile


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "development",
        "database_url": f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
        "jwt_secret": TEST_SECRET,
        "public_api_url": "https://api.example",
        "web_url": "https://web.example/chizma/",
        "cors_origins": "https://web.example",
    }
    values.update(overrides)
    return Settings.model_validate(values)


def build_app(settings: Settings, gateway: FakeGateway) -> FastAPI:
    app = create_app(settings, oauth_gateway=gateway)
    Base.metadata.create_all(app.state.session_factory.kw["bind"])
    return app


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


@pytest.fixture
def client_factory(tmp_path: Path, gateway: FakeGateway) -> Iterator[Callable[..., TestClient]]:
    def factory(**overrides: Any) -> TestClient:
        return TestClient(build_app(make_settings(tmp_path, **overrides), gateway))

    yield factory


@pytest.fixture
def client(client_factory: Callable[..., TestClient]) -> TestClient:
    return client_factory()
