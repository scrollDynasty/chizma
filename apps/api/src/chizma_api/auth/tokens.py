"""Signed access tokens (JWT, HS256) issued by the API after sign-in."""

import time

import jwt

from chizma_api.config import Settings

ISSUER = "chizma"


class InvalidTokenError(Exception):
    pass


def create_access_token(user_id: int, settings: Settings, now: float | None = None) -> str:
    issued = int(now if now is not None else time.time())
    payload = {
        "iss": ISSUER,
        "sub": str(user_id),
        "iat": issued,
        "exp": issued + settings.jwt_ttl_hours * 3600,
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm="HS256")


def read_user_id(token: str, settings: Settings) -> int:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            issuer=ISSUER,
            options={"require": ["exp", "sub", "iss"]},
        )
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidTokenError(str(exc)) from exc
