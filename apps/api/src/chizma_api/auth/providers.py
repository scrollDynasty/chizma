"""OAuth providers behind a small interface so tests can replace the network part."""

from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import Request
from starlette.responses import Response

from chizma_api.config import Settings


@dataclass(frozen=True)
class OAuthProfile:
    provider: str
    provider_user_id: str
    login: str | None
    name: str | None
    avatar_url: str | None


class OAuthFailedError(Exception):
    pass


class OAuthGateway(Protocol):
    def providers(self) -> list[str]: ...

    async def redirect(self, request: Request, provider: str, redirect_uri: str) -> Response: ...

    async def fetch_profile(self, request: Request, provider: str) -> OAuthProfile: ...


class AuthlibGateway:
    """Real GitHub and Google OAuth via Authlib. Requests no email scopes on purpose."""

    def __init__(self, settings: Settings) -> None:
        self._oauth = OAuth()
        self._providers = settings.oauth_providers()
        if "github" in self._providers:
            self._oauth.register(
                "github",
                client_id=settings.github_client_id,
                client_secret=settings.github_client_secret.get_secret_value(),
                access_token_url="https://github.com/login/oauth/access_token",  # noqa: S106
                authorize_url="https://github.com/login/oauth/authorize",
                api_base_url="https://api.github.com/",
                client_kwargs={"scope": ""},  # public profile only
            )
        if "google" in self._providers:
            self._oauth.register(
                "google",
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret.get_secret_value(),
                server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
                client_kwargs={"scope": "openid profile"},  # no email
            )

    def providers(self) -> list[str]:
        return list(self._providers)

    def _client(self, provider: str) -> Any:
        client = self._oauth.create_client(provider)  # type: ignore[no-untyped-call]
        if client is None:
            raise OAuthFailedError(f"provider {provider} is not configured")
        return client

    async def redirect(self, request: Request, provider: str, redirect_uri: str) -> Response:
        response: Response = await self._client(provider).authorize_redirect(request, redirect_uri)
        return response

    async def fetch_profile(self, request: Request, provider: str) -> OAuthProfile:
        client = self._client(provider)
        try:
            token = await client.authorize_access_token(request)
            if provider == "github":
                resp = await client.get("user", token=token)
                resp.raise_for_status()
                data = resp.json()
                return OAuthProfile(
                    provider="github",
                    provider_user_id=str(data["id"]),
                    login=data.get("login"),
                    name=data.get("name") or data.get("login"),
                    avatar_url=data.get("avatar_url"),
                )
            info = token.get("userinfo") or {}
            if not info.get("sub"):
                raise OAuthFailedError("google did not return a subject")
            return OAuthProfile(
                provider="google",
                provider_user_id=str(info["sub"]),
                login=None,
                name=info.get("name"),
                avatar_url=info.get("picture"),
            )
        except (OAuthError, KeyError, httpx.HTTPError) as exc:
            raise OAuthFailedError(str(exc)) from exc
