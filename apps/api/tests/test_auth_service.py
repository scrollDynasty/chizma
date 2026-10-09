from pathlib import Path

from sqlalchemy.orm import Session

from chizma_api.auth.service import issue_login_code, redeem_login_code, upsert_user
from chizma_api.auth.tokens import InvalidTokenError, create_access_token, read_user_id
from chizma_api.db import Base, create_db_engine
from tests.conftest import GITHUB_PROFILE, make_settings


def make_session(tmp_path: Path) -> Session:
    engine = create_db_engine(f"sqlite:///{(tmp_path / 'svc.db').as_posix()}")
    Base.metadata.create_all(engine)
    return Session(engine)


def test_expired_login_code_is_rejected(tmp_path: Path) -> None:
    with make_session(tmp_path) as db:
        user = upsert_user(db, GITHUB_PROFILE)
        code = issue_login_code(db, user, now=1_000)

        assert redeem_login_code(db, code, now=1_061) is None


def test_fresh_login_code_returns_user(tmp_path: Path) -> None:
    with make_session(tmp_path) as db:
        user = upsert_user(db, GITHUB_PROFILE)
        code = issue_login_code(db, user, now=1_000)

        redeemed = redeem_login_code(db, code, now=1_059)

        assert redeemed is not None and redeemed.id == user.id


def test_expired_access_token_is_rejected(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, jwt_ttl_hours=1)
    token = create_access_token(7, settings, now=0)

    try:
        read_user_id(token, settings)
    except InvalidTokenError:
        return
    raise AssertionError("expired token was accepted")
