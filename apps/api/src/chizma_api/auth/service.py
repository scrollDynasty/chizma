"""Sign-in business logic: allow-list, user upsert and one-time login codes."""

import hashlib
import secrets
import time

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from chizma_api.auth.providers import OAuthProfile
from chizma_api.config import Settings
from chizma_api.models import LoginCode, User

LOGIN_CODE_TTL_SECONDS = 60


def is_allowed(profile: OAuthProfile, settings: Settings) -> bool:
    """Empty allow-list means everyone may sign in. Entries: provider:id or github:login."""
    if not settings.allowed_users:
        return True
    keys = {f"{profile.provider}:{profile.provider_user_id}".lower()}
    if profile.login:
        keys.add(f"{profile.provider}:{profile.login}".lower())
    return not keys.isdisjoint(settings.allowed_users)


def upsert_user(db: Session, profile: OAuthProfile) -> User:
    user = db.scalar(
        select(User).where(
            User.provider == profile.provider,
            User.provider_user_id == profile.provider_user_id,
        )
    )
    if user is None:
        user = User(provider=profile.provider, provider_user_id=profile.provider_user_id)
        db.add(user)
    user.login = profile.login
    user.name = profile.name
    user.avatar_url = profile.avatar_url
    user.last_login_at = func.now()
    db.flush()
    return user


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def issue_login_code(db: Session, user: User, now: float | None = None) -> str:
    current = int(now if now is not None else time.time())
    db.execute(delete(LoginCode).where(LoginCode.expires_at < current))
    code = secrets.token_urlsafe(32)
    db.add(
        LoginCode(
            code_hash=_hash(code),
            user_id=user.id,
            expires_at=current + LOGIN_CODE_TTL_SECONDS,
        )
    )
    return code


def redeem_login_code(db: Session, code: str, now: float | None = None) -> User | None:
    """Return the user for a valid code and delete the code (single use)."""
    current = int(now if now is not None else time.time())
    entry = db.get(LoginCode, _hash(code))
    if entry is None:
        return None
    db.delete(entry)
    if entry.expires_at < current:
        return None
    return db.get(User, entry.user_id)
