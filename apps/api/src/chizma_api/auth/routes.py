"""HTTP routes for sign-in.

Flow: editor -> /v1/auth/{provider}/login -> provider -> /v1/auth/{provider}/callback
-> editor /auth/callback?code=... -> POST /v1/auth/exchange -> JWT.
The JWT never appears in a URL.
"""

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.responses import Response

from chizma_api.auth.providers import OAuthFailedError, OAuthGateway, OAuthProfile
from chizma_api.auth.service import is_allowed, issue_login_code, redeem_login_code, upsert_user
from chizma_api.auth.tokens import create_access_token
from chizma_api.deps import CurrentUser, DbDep, SettingsDep
from chizma_api.models import User

router = APIRouter(prefix="/v1", tags=["auth"])


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider: str
    login: str | None
    name: str | None
    avatar_url: str | None


class ProvidersOut(BaseModel):
    providers: list[str]


class ExchangeIn(BaseModel):
    code: str = Field(min_length=16, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int
    user: UserOut


class TestLoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=50)


def oauth_gateway(request: Request) -> OAuthGateway:
    gateway: OAuthGateway = request.app.state.oauth_gateway
    return gateway


GatewayDep = Annotated[OAuthGateway, Depends(oauth_gateway)]


def _token_response(user: User, settings: SettingsDep) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, settings),
        expires_in=settings.jwt_ttl_hours * 3600,
        user=UserOut.model_validate(user),
    )


@router.get("/auth/providers")
def list_providers(settings: SettingsDep, gateway: GatewayDep) -> ProvidersOut:
    return ProvidersOut(providers=gateway.providers() if settings.auth_enabled else [])


@router.get("/auth/{provider}/login")
async def login(
    provider: str, request: Request, settings: SettingsDep, gateway: GatewayDep
) -> Response:
    if not settings.auth_enabled or provider not in gateway.providers():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown_provider")
    redirect_uri = f"{settings.public_api_url}/v1/auth/{provider}/callback"
    return await gateway.redirect(request, provider, redirect_uri)


@router.get("/auth/{provider}/callback")
async def callback(
    provider: str, request: Request, settings: SettingsDep, gateway: GatewayDep, db: DbDep
) -> RedirectResponse:
    def back_to_editor(**params: str) -> RedirectResponse:
        return RedirectResponse(
            f"{settings.web_url}/auth/callback?{urlencode(params)}",
            status_code=status.HTTP_302_FOUND,
        )

    if not settings.auth_enabled or provider not in gateway.providers():
        return back_to_editor(error="unknown_provider")
    try:
        profile = await gateway.fetch_profile(request, provider)
    except OAuthFailedError:
        return back_to_editor(error="oauth_failed")
    if not is_allowed(profile, settings):
        return back_to_editor(error="not_allowed")

    user = upsert_user(db, profile)
    code = issue_login_code(db, user)
    db.commit()
    return back_to_editor(code=code)


@router.post("/auth/exchange")
def exchange(body: ExchangeIn, settings: SettingsDep, db: DbDep) -> TokenOut:
    if not settings.auth_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "auth_disabled")
    user = redeem_login_code(db, body.code)
    db.commit()
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid_code")
    return _token_response(user, settings)


@router.post("/auth/test-login", include_in_schema=False)
def test_login(body: TestLoginIn, settings: SettingsDep, db: DbDep) -> TokenOut:
    """Sign in without OAuth. Exists only when CHIZMA_ENV=test (end-to-end tests)."""
    if settings.env != "test":
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    profile = OAuthProfile("test", body.login, body.login, body.login, None)
    user = upsert_user(db, profile)
    db.commit()
    return _token_response(user, settings)


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
