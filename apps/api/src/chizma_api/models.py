"""ORM models."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from chizma_api.db import Base


class User(Base):
    """A person who signed in with GitHub or Google. Email is deliberately not stored."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("provider", "provider_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(20))
    provider_user_id: Mapped[str] = mapped_column(String(64))
    login: Mapped[str | None] = mapped_column(String(100))
    name: Mapped[str | None] = mapped_column(String(200))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_login_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LoginCode(Base):
    """One-time code handed to the editor after OAuth; exchanged for a JWT within a minute."""

    __tablename__ = "login_codes"

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[int] = mapped_column(Integer)  # unix seconds


class GenerationUsage(Base):
    """How many generations a user started on a given UTC day."""

    __tablename__ = "generation_usage"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD (UTC)
    count: Mapped[int] = mapped_column(Integer, default=0)


class DailySpend(Base):
    """Project-wide AI spend per UTC day, used for the daily budget cap."""

    __tablename__ = "daily_spend"

    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    usd: Mapped[float] = mapped_column(Float, default=0.0)
    generations: Mapped[int] = mapped_column(Integer, default=0)
