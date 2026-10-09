"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from chizma_api.auth.providers import OAuthProfile
from chizma_api.auth.service import is_allowed
from chizma_api.auth.tokens import InvalidTokenError, read_user_id
from chizma_api.config import Settings
from chizma_api.db import get_db
from chizma_api.models import User


def app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


SettingsDep = Annotated[Settings, Depends(app_settings)]
DbDep = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(
    settings: SettingsDep,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise _unauthorized("not_authenticated")
    try:
        user_id = read_user_id(credentials.credentials, settings)
    except InvalidTokenError:
        raise _unauthorized("invalid_token") from None
    user = db.get(User, user_id)
    if user is None or not settings.auth_enabled:
        raise _unauthorized("invalid_token")
    if not is_allowed(
        OAuthProfile(user.provider, user.provider_user_id, user.login, user.name, None), settings
    ):
        raise _unauthorized("not_allowed")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
